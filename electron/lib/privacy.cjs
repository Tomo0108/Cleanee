'use strict';
const path = require('path');
const { WIN, safeStat, walk, exists, deleteFiles, runningProcesses, run, ps } = require('./util.cjs');
const { CHROMIUM_BROWSERS, chromiumProfiles, firefoxProfiles } = require('./junk.cjs');

/**
 * Privacy traces. Saved passwords, bookmarks and extensions are never touched.
 * Each trace = { id, group, name, desc, files: [{path,size}], dirs: [] }
 */
const traces = new Map();

async function collectFiles(list) {
  const files = [];
  for (const p of list) {
    const st = await safeStat(p);
    if (!st) continue;
    if (st.isFile()) files.push({ path: p, size: st.size });
    else if (st.isDirectory()) await walk(p, (f, s) => { files.push({ path: f, size: s.size }); });
  }
  return files;
}

async function scan() {
  traces.clear();
  const running = await runningProcesses();
  const groups = [];

  for (const b of CHROMIUM_BROWSERS()) {
    if (!(await exists(b.dir))) continue;
    const profiles = b.single ? [b.dir] : await chromiumProfiles(b.dir);
    const pick = (names) => profiles.flatMap((p) => names.map((n) => path.join(p, n)));
    const defs = [
      { key: 'history', name: '閲覧履歴', desc: '訪問したサイトとダウンロード履歴', files: pick(['History', 'History-journal', 'Visited Links', 'Top Sites', 'Top Sites-journal', 'Shortcuts', 'Shortcuts-journal']) },
      { key: 'cookies', name: 'Cookie', desc: 'ログイン状態などのサイトデータ（再ログインが必要になります）', files: pick([path.join('Network', 'Cookies'), path.join('Network', 'Cookies-journal'), 'Cookies', 'Cookies-journal']), off: true },
      { key: 'sessions', name: 'セッション・タブ', desc: '前回開いていたタブの情報', files: pick(['Sessions', 'Current Session', 'Current Tabs', 'Last Session', 'Last Tabs']) },
      { key: 'autofill', name: 'フォーム入力履歴', desc: 'フォームの自動入力候補や保存した住所など（パスワードは削除しません）', files: pick(['Web Data', 'Web Data-journal']), off: true },
    ];
    groups.push(await buildGroup(b.name, b.exe, running, defs));
  }

  const ffBase = path.join(WIN.roaming, 'Mozilla', 'Firefox', 'Profiles');
  if (await exists(ffBase)) {
    const profiles = await firefoxProfiles(ffBase);
    const pick = (names) => profiles.flatMap((p) => names.map((n) => path.join(p, n)));
    groups.push(await buildGroup('Mozilla Firefox', 'firefox.exe', running, [
      { key: 'cookies', name: 'Cookie', desc: 'ログイン状態などのサイトデータ', files: pick(['cookies.sqlite', 'cookies.sqlite-wal']), off: true },
      { key: 'sessions', name: 'セッション・タブ', desc: '前回開いていたタブの情報', files: pick(['sessionstore.jsonlz4', 'sessionstore-backups']) },
      { key: 'autofill', name: 'フォーム入力履歴', desc: '入力フォームの自動補完データ', files: pick(['formhistory.sqlite']), off: true },
    ]));
  }

  // Windows activity traces
  const recent = path.join(WIN.roaming, 'Microsoft', 'Windows', 'Recent');
  const winDefs = [
    { key: 'recent', name: '最近使ったファイル', desc: 'エクスプローラーとジャンプリストの履歴', files: [recent] },
  ];
  const winGroup = await buildGroup('Windows', null, running, winDefs);
  winGroup.traces.push(
    { id: 'Windows:runmru', name: '「ファイル名を指定して実行」の履歴', desc: 'Win+R で入力したコマンド', size: 0, count: 1, selected: true, special: true },
    { id: 'Windows:clipboard', name: 'クリップボード', desc: '現在コピーされている内容', size: 0, count: 1, selected: false, special: true },
    { id: 'Windows:dns', name: 'DNS キャッシュ', desc: '最近アクセスしたドメインの記録', size: 0, count: 1, selected: true, special: true },
  );
  groups.push(winGroup);

  return groups.filter((g) => g.traces.length);
}

async function buildGroup(name, exe, running, defs) {
  const isRunning = exe ? running.has(exe) : false;
  const group = { name, running: isRunning, traces: [] };
  for (const d of defs) {
    const files = await collectFiles(d.files);
    if (!files.length) continue;
    const id = `${name}:${d.key}`;
    traces.set(id, { files, roots: d.files.filter((f) => !path.extname(f)) });
    group.traces.push({ id, name: d.name, desc: d.desc, size: files.reduce((a, f) => a + f.size, 0), count: files.length, selected: !d.off });
  }
  return group;
}

async function clean(ids) {
  let freed = 0, removed = 0, failed = 0;
  for (const id of ids) {
    if (id === 'Windows:runmru') {
      await run('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU', '/f']);
      removed++; continue;
    }
    if (id === 'Windows:clipboard') {
      await ps('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear()');
      removed++; continue;
    }
    if (id === 'Windows:dns') {
      await run('ipconfig', ['/flushdns']);
      removed++; continue;
    }
    const t = traces.get(id);
    if (!t) continue;
    const r = await deleteFiles(t.files, t.roots);
    freed += r.freed; removed += r.removed; failed += r.failed;
    traces.delete(id);
  }
  return { freed, removed, failed };
}

module.exports = { scan, clean };
