'use strict';
const path = require('path');
const { WIN, walk, listDir, exists, safeStat, deleteFiles, psJson, ps } = require('./util.cjs');
const settings = require('./settings.cjs');
const tempAge = () => settings.get().tempAgeHours || 24;

const HOUR = 3600 * 1000;

/** Returns profile directories inside a Chromium "User Data" directory. */
async function chromiumProfiles(userData) {
  const entries = await listDir(userData);
  return entries
    .filter((e) => e.isDirectory() && (e.name === 'Default' || /^Profile \d+$/.test(e.name) || e.name === 'Guest Profile'))
    .map((e) => path.join(userData, e.name));
}

const CHROMIUM_BROWSERS = () => [
  { name: 'Google Chrome', exe: 'chrome.exe', dir: path.join(WIN.local, 'Google', 'Chrome', 'User Data') },
  { name: 'Microsoft Edge', exe: 'msedge.exe', dir: path.join(WIN.local, 'Microsoft', 'Edge', 'User Data') },
  { name: 'Brave', exe: 'brave.exe', dir: path.join(WIN.local, 'BraveSoftware', 'Brave-Browser', 'User Data') },
  { name: 'Vivaldi', exe: 'vivaldi.exe', dir: path.join(WIN.local, 'Vivaldi', 'User Data') },
  { name: 'Opera', exe: 'opera.exe', dir: path.join(WIN.roaming, 'Opera Software', 'Opera Stable'), single: true },
];

async function firefoxProfiles(base) {
  const entries = await listDir(base);
  return entries.filter((e) => e.isDirectory()).map((e) => path.join(base, e.name));
}

/** Each category resolves to a list of sources: { dir, pattern?, minAgeHours? } or { file }. */
const CATEGORIES = [
  {
    id: 'userTemp', name: 'ユーザー一時ファイル', desc: 'アプリが作成し、不要になった一時ファイル',
    icon: 'FileClock', selected: true,
    sources: async () => [{ dir: WIN.temp, minAgeHours: tempAge() }],
  },
  {
    id: 'systemTemp', name: 'システム一時ファイル', desc: 'Windows が使用した一時ファイル',
    icon: 'Cpu', selected: true, admin: true,
    sources: async () => [{ dir: path.join(WIN.root, 'Temp'), minAgeHours: tempAge() }],
  },
  {
    id: 'browserCache', name: 'ブラウザキャッシュ', desc: 'Chrome / Edge / Firefox などのキャッシュ',
    icon: 'Globe', selected: true,
    sources: async () => {
      const out = [];
      for (const b of CHROMIUM_BROWSERS()) {
        const profiles = b.single ? [b.dir] : await chromiumProfiles(b.dir);
        for (const p of profiles) {
          for (const sub of ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', path.join('Service Worker', 'CacheStorage'), path.join('Service Worker', 'ScriptCache')]) {
            out.push({ dir: path.join(p, sub) });
          }
        }
        if (!b.single) {
          for (const sub of ['ShaderCache', 'GrShaderCache', 'GraphiteDawnCache']) out.push({ dir: path.join(b.dir, sub) });
        }
      }
      for (const p of await firefoxProfiles(path.join(WIN.local, 'Mozilla', 'Firefox', 'Profiles'))) {
        out.push({ dir: path.join(p, 'cache2') }, { dir: path.join(p, 'startupCache') });
      }
      out.push({ dir: path.join(WIN.local, 'Microsoft', 'Windows', 'INetCache') });
      return out;
    },
  },
  {
    id: 'appCache', name: 'アプリケーションキャッシュ', desc: 'Discord・Slack・Teams・VS Code などのキャッシュ',
    icon: 'AppWindow', selected: true,
    sources: async () => {
      const electronApps = [
        path.join(WIN.roaming, 'discord'), path.join(WIN.roaming, 'Slack'), path.join(WIN.roaming, 'Code'),
        path.join(WIN.roaming, 'Microsoft', 'Teams'), path.join(WIN.roaming, 'Notion'), path.join(WIN.roaming, 'Figma'),
        path.join(WIN.roaming, 'Zoom'), path.join(WIN.roaming, 'obsidian'), path.join(WIN.roaming, 'Spotify'),
      ];
      const out = [];
      for (const base of electronApps) {
        for (const sub of ['Cache', 'Code Cache', 'GPUCache', 'CachedData', 'DawnCache', path.join('Service Worker', 'CacheStorage')]) {
          out.push({ dir: path.join(base, sub) });
        }
      }
      out.push(
        { dir: path.join(WIN.local, 'Spotify', 'Data') },
        { dir: path.join(WIN.local, 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache', 'Microsoft', 'MSTeams', 'EBWebView', 'Default', 'Cache') },
      );
      return out;
    },
  },
  {
    id: 'shaderCache', name: 'シェーダー・GPU キャッシュ', desc: 'DirectX / NVIDIA / AMD / Intel が生成するキャッシュ',
    icon: 'Gpu', selected: true,
    sources: async () => [
      { dir: path.join(WIN.local, 'D3DSCache') },
      { dir: path.join(WIN.local, 'NVIDIA', 'DXCache') },
      { dir: path.join(WIN.local, 'NVIDIA', 'GLCache') },
      { dir: path.join(WIN.local, 'AMD', 'DxCache') },
      { dir: path.join(WIN.local, 'AMD', 'DxcCache') },
      { dir: path.join(WIN.local, 'AMD', 'GLCache') },
      { dir: path.join(WIN.local, 'AMD', 'VkCache') },
      { dir: path.join(WIN.local, 'Intel', 'ShaderCache') },
      { dir: path.join(WIN.local + 'Low', 'Intel', 'ShaderCache') },
    ],
  },
  {
    id: 'logs', name: 'ログファイル', desc: '7 日以上前の Windows・アプリのログ',
    icon: 'ScrollText', selected: true, admin: true,
    sources: async () => [
      { dir: path.join(WIN.root, 'Logs'), pattern: /\.(log|etl|txt|cab)$/i, minAgeHours: 24 * 7 },
      { dir: path.join(WIN.root, 'Panther'), pattern: /\.(log|etl)$/i, minAgeHours: 24 * 7 },
      { dir: path.join(WIN.root, 'System32', 'LogFiles', 'Setupcln'), minAgeHours: 24 * 7 },
      { dir: path.join(WIN.local, 'Microsoft', 'Windows', 'WebCache.old') },
    ],
  },
  {
    id: 'crashReports', name: 'クラッシュレポート・ダンプ', desc: 'エラー報告とメモリダンプファイル',
    icon: 'Bug', selected: true,
    sources: async () => [
      { dir: path.join(WIN.local, 'CrashDumps') },
      { dir: path.join(WIN.local, 'Microsoft', 'Windows', 'WER') },
      { dir: path.join(WIN.programData, 'Microsoft', 'Windows', 'WER', 'ReportArchive') },
      { dir: path.join(WIN.programData, 'Microsoft', 'Windows', 'WER', 'ReportQueue') },
      { dir: path.join(WIN.root, 'Minidump') },
      { dir: path.join(WIN.root, 'LiveKernelReports'), pattern: /\.dmp$/i },
      { file: path.join(WIN.root, 'MEMORY.DMP') },
    ],
  },
  {
    id: 'updateCache', name: 'Windows Update キャッシュ', desc: 'インストール済み更新プログラムのダウンロードファイル',
    icon: 'RefreshCw', selected: true, admin: true,
    sources: async () => [
      { dir: path.join(WIN.root, 'SoftwareDistribution', 'Download'), minAgeHours: 24 },
      { dir: path.join(WIN.root, 'ServiceProfiles', 'NetworkService', 'AppData', 'Local', 'Microsoft', 'Windows', 'DeliveryOptimization', 'Cache') },
    ],
  },
  {
    id: 'devCache', name: '開発ツールのキャッシュ', desc: 'npm / pip / NuGet / Yarn などのパッケージキャッシュ',
    icon: 'Code', selected: false,
    sources: async () => [
      { dir: path.join(WIN.local, 'npm-cache') },
      { dir: path.join(WIN.local, 'pip', 'Cache') },
      { dir: path.join(WIN.local, 'Yarn', 'Cache') },
      { dir: path.join(WIN.local, 'pnpm', 'store') },
      { dir: path.join(WIN.local, 'NuGet', 'v3-cache') },
      { dir: path.join(WIN.local, 'go-build') },
      { dir: path.join(WIN.home, '.gradle', 'caches') },
    ],
  },
];

const results = new Map();

async function recycleBinInfo() {
  const data = await psJson(
    `$items=(New-Object -ComObject Shell.Application).NameSpace(10).Items();` +
    `$s=0;$c=0;foreach($i in $items){$c++;try{$s+=[int64]$i.ExtendedProperty('Size')}catch{}};` +
    `@{size=$s;count=$c}|ConvertTo-Json -Compress`, {});
  return { size: Number(data.size) || 0, count: Number(data.count) || 0 };
}

async function scan(send, signal) {
  results.clear();
  const out = [];
  const now = Date.now();
  let totalSoFar = 0;
  let lastEmit = 0;

  for (const cat of CATEGORIES) {
    if (signal.aborted) break;
    const sources = await cat.sources();
    const files = [];
    const roots = [];
    const seen = new Set();
    for (const src of sources) {
      if (signal.aborted) break;
      if (src.file) {
        const st = await safeStat(src.file);
        if (st && st.isFile()) files.push({ path: src.file, size: st.size, mtime: st.mtimeMs });
        continue;
      }
      if (!(await exists(src.dir)) || settings.isExcluded(src.dir)) continue;
      const key = src.dir.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      roots.push(src.dir);
      const minAge = (src.minAgeHours || 0) * HOUR;
      await walk(src.dir, (p, st) => {
        if (src.pattern && !src.pattern.test(p)) return;
        if (minAge && now - st.mtimeMs < minAge) return;
        files.push({ path: p, size: st.size, mtime: st.mtimeMs });
        totalSoFar += st.size;
      }, {
        signal,
        skipDir: (d) => settings.isExcluded(d),
        onDir: (d) => {
          const t = Date.now();
          if (t - lastEmit > 80) { lastEmit = t; send({ category: cat.id, current: d, total: totalSoFar }); }
        },
      });
    }
    const size = files.reduce((a, f) => a + f.size, 0);
    results.set(cat.id, { files, roots });
    out.push(summarize(cat, files, size));
    send({ category: cat.id, total: totalSoFar, done: cat.id });
  }

  if (!signal.aborted) {
    send({ category: 'recycleBin', current: 'ごみ箱', total: totalSoFar });
    const rb = await recycleBinInfo();
    out.push({ id: 'recycleBin', name: 'ごみ箱', desc: '削除済みファイルを完全に消去します', icon: 'Trash2', selected: true, size: rb.size, count: rb.count, items: [] });
  }
  return out;
}

function summarize(cat, files, size) {
  const items = [...files].sort((a, b) => b.size - a.size).slice(0, 60).map((f) => ({ path: f.path, size: f.size }));
  return { id: cat.id, name: cat.name, desc: cat.desc, icon: cat.icon, admin: !!cat.admin, selected: cat.selected, size, count: files.length, items };
}

async function clean(ids, send, excluded = []) {
  const skip = new Set(excluded.map((p) => p.toLowerCase()));
  let freed = 0, removed = 0, failed = 0;
  let i = 0;
  for (const id of ids) {
    i++;
    send({ category: id, index: i, count: ids.length });
    if (id === 'recycleBin') {
      const before = await recycleBinInfo();
      await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');
      const after = await recycleBinInfo();
      freed += Math.max(0, before.size - after.size);
      removed += Math.max(0, before.count - after.count);
      continue;
    }
    const r = results.get(id);
    if (!r) continue;
    const res = await deleteFiles(skip.size ? r.files.filter((f) => !skip.has(f.path.toLowerCase())) : r.files, r.roots);
    freed += res.freed; removed += res.removed; failed += res.failed;
    results.delete(id);
  }
  return { freed, removed, failed };
}

module.exports = { scan, clean, CHROMIUM_BROWSERS, chromiumProfiles, firefoxProfiles, recycleBinInfo };
