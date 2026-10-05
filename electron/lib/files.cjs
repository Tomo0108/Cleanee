'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { WIN, walk, listDir } = require('./util.cjs');
const settings = require('./settings.cjs');
const skipDir = (full, name) => SKIP_DIRS.has(name.toLowerCase()) || settings.isExcluded(full);

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

async function scanLarge({ roots, minSize = 50 * 1024 * 1024 }, send, signal) {
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

/* ---------------- Duplicates ---------------- */

async function hashFile(p, { head } = {}) {
  const h = crypto.createHash('sha1');
  if (head) {
    const fd = await fsp.open(p, 'r');
    try {
      const buf = Buffer.alloc(head);
      const { bytesRead } = await fd.read(buf, 0, head, 0);
      h.update(buf.subarray(0, bytesRead));
      const st = await fd.stat();
      if (st.size > head * 2) {
        const { bytesRead: tail } = await fd.read(buf, 0, head, st.size - head);
        h.update(buf.subarray(0, tail));
      }
    } finally { await fd.close(); }
    return h.digest('hex');
  }
  return new Promise((resolve, reject) => {
    fs.createReadStream(p, { highWaterMark: 1024 * 1024 })
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

async function scanDuplicates({ roots, minSize = 1024 }, send, signal) {
  const bySize = new Map();
  let scanned = 0;
  const emit = throttle((dir) => send({ stage: 'collect', current: dir, scanned }));
  for (const root of resolveRoots(roots)) {
    await walk(root, (p, st) => {
      scanned++;
      if (st.size < minSize) return;
      const arr = bySize.get(st.size);
      const entry = { path: p, name: path.basename(p), size: st.size, mtime: st.mtimeMs, kind: kindOf(p) };
      if (arr) arr.push(entry); else bySize.set(st.size, [entry]);
    }, { signal, onDir: emit, skipDir });
  }

  const candidates = [...bySize.values()].filter((a) => a.length > 1);
  const total = candidates.reduce((a, g) => a + g.length, 0);
  let hashed = 0;
  const emitHash = throttle((cur) => send({ stage: 'hash', current: cur, hashed, total }));
  const groups = [];

  const groupBy = async (files, opts) => {
    const map = new Map();
    for (const f of files) {
      if (signal.aborted) return [];
      try {
        const k = await hashFile(f.path, opts);
        const arr = map.get(k);
        if (arr) arr.push(f); else map.set(k, [f]);
      } catch { /* unreadable */ }
    }
    return [...map.entries()].filter(([, a]) => a.length > 1);
  };

  for (const files of candidates) {
    if (signal.aborted) break;
    hashed += files.length;
    emitHash(files[0].path);
    const partial = await groupBy(files, { head: 64 * 1024 });
    for (const [, sub] of partial) {
      const full = sub[0].size <= 128 * 1024 ? [[null, sub]] : await groupBy(sub);
      for (const [, dup] of full) {
        groups.push({ id: crypto.randomUUID(), size: dup[0].size, name: dup[0].name, kind: dup[0].kind, files: dup.sort((a, b) => a.mtime - b.mtime) });
      }
    }
  }
  return groups.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
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
