'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { WIN, walk, listDir, isUnder } = require('./util.cjs');

// Runs inside a worker thread (see files-host.cjs), so nothing here may require Electron:
// the user's excluded folders arrive as `excludes` in each scan's options.
const skipper = (excludes) => (full, name) => SKIP_DIRS.has(name.toLowerCase()) || isUnder(full, excludes);

const KINDS = {
  video: /\.(mp4|mkv|mov|avi|wmv|flv|webm|m4v|mpg|mpeg|ts|m2ts)$/i,
  audio: /\.(mp3|wav|flac|aac|m4a|ogg|wma|aiff)$/i,
  image: /\.(jpe?g|png|gif|bmp|tiff?|heic|webp|raw|cr2|nef|arw|dng|psd)$/i,
  archive: /\.(zip|rar|7z|tar|gz|bz2|xz|cab|tgz)$/i,
  installer: /\.(iso|img|vhdx?|vmdk|exe|msi|msix|appx|dmg)$/i,
  document: /\.(pdf|docx?|xlsx?|pptx?|txt|csv|key|pages|numbers|epub)$/i,
};
const kindOf = (p) => Object.keys(KINDS).find((k) => KINDS[k].test(p)) || 'other';

const SKIP_DIRS = new Set(['appdata', '$recycle.bin', 'system volume information', 'node_modules', '.git', 'windows', 'program files', 'program files (x86)', 'programdata', 'msocache', '$windows.~bt', '$windows.~ws', 'windows.old']);

function throttle(fn, ms = 80) {
  let last = 0;
  return (...a) => { const t = Date.now(); if (t - last > ms) { last = t; fn(...a); } };
}

/** '~' (or no roots) means the user's profile folder; drive roots like 'E:\\' are scanned whole. */
const resolveRoots = (roots) => (roots && roots.length ? roots : ['~']).map((r) => (r === '~' ? WIN.home : r));

/* ---------------- Large & old files ---------------- */

async function scanLarge({ roots, minSize = 50 * 1024 * 1024, excludes }, send, signal) {
  const skipDir = skipper(excludes);
  const found = [];
  let scanned = 0;
  const emit = throttle((dir) => send({ current: dir, scanned, found: found.length }));
  for (const root of resolveRoots(roots)) {
    await walk(root, (p, st) => {
      scanned++;
      if (st.size >= minSize) {
        found.push({ path: p, name: path.basename(p), size: st.size, mtime: st.mtimeMs, atime: st.atimeMs, kind: kindOf(p) });
      }
    }, { signal, onDir: emit, skipDir });
  }
  return found.sort((a, b) => b.size - a.size);
}

/* ---------------- Duplicates ----------------
 *
 * A staged funnel, cheapest test first, so almost every file is ruled out without being read:
 *   1. Group by exact size (metadata only, gathered during the walk).
 *   2. Drop hard links: several paths to the same file are not duplicates.
 *   3. Read three small samples (head / middle / tail) in one open. Files no bigger than the
 *      samples are compared in full here and need no further work.
 *   4. Only files whose samples still match are hashed in full, a few at a time.
 */

const SAMPLE = 16 * 1024;
const HASH_PARALLEL = 4;

/** Key from head + middle + tail; covers the whole file when size <= 3 * SAMPLE. */
async function sampleKey(p, size) {
  const fd = await fsp.open(p, 'r');
  try {
    const h = crypto.createHash('sha1');
    if (size <= SAMPLE * 3) {
      const buf = Buffer.allocUnsafe(size);
      let off = 0;
      while (off < size) {
        const { bytesRead } = await fd.read(buf, off, size - off, off);
        if (!bytesRead) break;
        off += bytesRead;
      }
      h.update(buf.subarray(0, off));
    } else {
      const buf = Buffer.allocUnsafe(SAMPLE);
      for (const pos of [0, Math.floor((size - SAMPLE) / 2), size - SAMPLE]) {
        const { bytesRead } = await fd.read(buf, 0, SAMPLE, pos);
        h.update(buf.subarray(0, bytesRead));
      }
    }
    return h.digest('hex');
  } finally { await fd.close(); }
}

function fullHash(p, signal, onBytes) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    const rs = fs.createReadStream(p, { highWaterMark: 1024 * 1024 });
    const abort = () => rs.destroy(new Error('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    rs.on('data', (d) => { h.update(d); onBytes(d.length); })
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
      .on('close', () => signal.removeEventListener('abort', abort));
  });
}

/** Splits each group by `keyOf`, keeping only sub-groups that still hold 2+ files. */
async function refine(groups, keyOf, { signal, parallel, onDone }) {
  const limit = limiter(parallel);
  const out = [];
  await Promise.all(groups.map(async (files) => {
    const map = new Map();
    await Promise.all(files.map((f) => limit(async () => {
      if (signal.aborted) return;
      try {
        const k = await keyOf(f);
        const arr = map.get(k);
        if (arr) arr.push(f); else map.set(k, [f]);
      } catch { /* unreadable or locked */ }
      onDone(f);
    })));
    for (const arr of map.values()) if (arr.length > 1) out.push(arr);
  }));
  return out;
}

async function scanDuplicates({ roots, minSize = 1024, excludes }, send, signal) {
  const skipDir = skipper(excludes);
  // size -> entry | entry[]; a single entry is stored bare since most sizes are unique.
  const bySize = new Map();
  let scanned = 0;
  const emit = throttle((dir) => send({ stage: 'collect', current: dir, scanned }));
  const seen = new Set();
  for (const root of resolveRoots(roots)) {
    await walk(root, (p, st) => {
      scanned++;
      if (st.size < minSize) return;
      const entry = { path: p, size: st.size, mtime: st.mtimeMs, inode: st.ino ? `${st.dev}:${st.ino}` : '' };
      const cur = bySize.get(st.size);
      if (!cur) bySize.set(st.size, entry);
      else if (Array.isArray(cur)) cur.push(entry);
      else bySize.set(st.size, [cur, entry]);
    }, { signal, onDir: emit, skipDir });
  }
  send({ stage: 'collect', scanned });

  // Same size, distinct files (hard links and overlapping roots collapse to one entry).
  let candidates = [];
  for (const v of bySize.values()) {
    if (!Array.isArray(v)) continue;
    const uniq = v.filter((f) => {
      const id = f.inode || f.path.toLowerCase();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (uniq.length > 1) candidates.push(uniq);
  }
  bySize.clear(); seen.clear();
  // Big files first: they carry most of the reclaimable space if the user stops early.
  candidates.sort((a, b) => b[0].size - a[0].size);

  const total = candidates.reduce((a, g) => a + g.length, 0);
  let done = 0;
  const emitSample = throttle((f) => send({ stage: 'compare', current: f.path, done, total }));
  const sampled = await refine(candidates, (f) => sampleKey(f.path, f.size), {
    signal, parallel: 8, onDone: (f) => { done++; emitSample(f); },
  });
  candidates = null;

  const confirmed = sampled.filter((g) => g[0].size <= SAMPLE * 3);
  const needHash = sampled.filter((g) => g[0].size > SAMPLE * 3);
  const totalBytes = needHash.reduce((a, g) => a + g[0].size * g.length, 0);
  let bytes = 0;
  let current = '';
  const emitHash = throttle(() => send({ stage: 'hash', current, bytes, totalBytes, found: confirmed.length }));
  const hashed = await refine(needHash, (f) => {
    current = f.path;
    return fullHash(f.path, signal, (n) => { bytes += n; emitHash(); });
  }, { signal, parallel: HASH_PARALLEL, onDone: () => {} });

  return [...confirmed, ...hashed]
    .map((files) => {
      files.sort((a, b) => a.mtime - b.mtime);
      const name = path.basename(files[0].path);
      const kind = kindOf(name);
      return {
        id: crypto.randomUUID(), size: files[0].size, name, kind,
        files: files.map((f) => ({ path: f.path, name: path.basename(f.path), size: f.size, mtime: f.mtime, kind })),
      };
    })
    .sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
}

/* ---------------- Space Lens ---------------- */

function limiter(n) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= n || !q.length) return;
    active++;
    const { fn, res, rej } = q.shift();
    fn().then(res, rej).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

let spaceRoot = null;
const spaceIndex = new Map();

async function scanSpace(root, send, signal) {
  spaceIndex.clear();
  const limit = limiter(24);
  let bytes = 0, files = 0;
  const emit = throttle((dir) => send({ current: dir, bytes, files }), 100);

  const build = async (dir, name) => {
    const node = { name, path: dir, type: 'dir', size: 0, count: 0, dirs: [], files: [] };
    spaceIndex.set(dir.toLowerCase(), node);
    if (signal.aborted) return node;
    emit(dir);
    const entries = await limit(() => listDir(dir));
    const subs = [];
    await Promise.all(entries.map(async (e) => {
      if (e.isSymbolicLink()) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) subs.push(build(full, e.name));
      else if (e.isFile()) {
        try {
          const st = await limit(() => fsp.lstat(full));
          node.files.push({ name: e.name, path: full, type: 'file', size: st.size });
          node.size += st.size; node.count++;
          bytes += st.size; files++;
        } catch { /* locked system file */ }
      }
    }));
    for (const child of await Promise.all(subs)) {
      node.dirs.push(child);
      node.size += child.size; node.count += child.count;
    }
    // Keep only the biggest files per folder to bound memory; fold the rest.
    node.files.sort((a, b) => b.size - a.size);
    if (node.files.length > 40) {
      const rest = node.files.splice(40);
      node.otherFiles = { size: rest.reduce((a, f) => a + f.size, 0), count: rest.length };
    }
    return node;
  };

  const name = path.basename(root) || root;
  spaceRoot = await build(root, name);
  return view(spaceRoot);
}

/** Serializable view of a node, 2 levels deep, children sorted by size. */
function view(node, depth = 2) {
  if (!node) return null;
  const kids = [...node.dirs, ...node.files].sort((a, b) => b.size - a.size);
  const minSize = node.size * 0.002;
  const shown = kids.filter((k, i) => i < 60 && k.size > minSize);
  const hidden = kids.slice(shown.length);
  let otherSize = hidden.reduce((a, k) => a + k.size, 0) + (node.otherFiles?.size || 0);
  let otherCount = hidden.length + (node.otherFiles?.count || 0);
  const children = shown.map((k) => k.type === 'dir' && depth > 1 ? view(k, depth - 1) : { name: k.name, path: k.path, type: k.type, size: k.size, count: k.count || 1, hasChildren: k.type === 'dir' && (k.dirs.length + k.files.length) > 0 });
  if (otherSize > 0) children.push({ name: `その他 ${otherCount} 項目`, path: node.path + '\u0000other', type: 'other', size: otherSize, count: otherCount });
  return { name: node.name, path: node.path, type: 'dir', size: node.size, count: node.count, children, hasChildren: true };
}

function spaceNode(p) {
  return view(spaceIndex.get(p.toLowerCase()));
}

/** Update cached tree after items were trashed so the view stays consistent. */
function spaceRemove(paths) {
  for (const p of paths) {
    const parent = spaceIndex.get(path.dirname(p).toLowerCase());
    if (!parent) continue;
    const lower = p.toLowerCase();
    let removed = 0;
    parent.dirs = parent.dirs.filter((d) => (d.path.toLowerCase() === lower ? ((removed = d.size), false) : true));
    parent.files = parent.files.filter((f) => (f.path.toLowerCase() === lower ? ((removed = f.size), false) : true));
    let cur = parent;
    while (cur && removed) {
      cur.size -= removed;
      const up = path.dirname(cur.path);
      cur = up !== cur.path ? spaceIndex.get(up.toLowerCase()) : null;
    }
  }
}

module.exports = { scanLarge, scanDuplicates, scanSpace, spaceNode, spaceRemove };
