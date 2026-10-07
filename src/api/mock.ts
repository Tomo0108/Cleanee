/**
 * Demo backend used when the UI runs outside Windows (browser / macOS Electron).
 * Nothing here touches the real file system.
 */
import type {
  CleaneeApi, Settings, DupGroup, InstalledApp, JunkCategory, LargeFile, PrivacyGroup, SpaceNode, StartupItem, UpdateItem,
} from './types';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const DAY = 86400000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

type Listener = (d: any) => void;
const listeners = new Map<string, Listener[]>();
const emit = (task: string, data: unknown) => (listeners.get(task) || []).forEach((cb) => cb(data));
const cancelled = new Set<string>();

const U = 'C:\\Users\\tomo';
const LOCAL = `${U}\\AppData\\Local`;

async function simulate(task: string, steps: string[], duration: number, make: (i: number, p: string) => object) {
  cancelled.delete(task);
  const per = duration / steps.length;
  for (let i = 0; i < steps.length; i++) {
    if (cancelled.has(task)) return false;
    emit(task, make(i, steps[i]));
    await wait(per);
  }
  return true;
}

const tempPaths = (base: string, n: number, ext = 'tmp') =>
  Array.from({ length: n }, (_, i) => ({ path: `${base}\\${Math.random().toString(36).slice(2, 10)}${i}.${ext}`, size: Math.round(rnd(0.2, 80) * MB) })).sort((a, b) => b.size - a.size);

const JUNK: JunkCategory[] = [
  { id: 'userTemp', name: 'ユーザー一時ファイル', desc: 'アプリが作成し、不要になった一時ファイル', icon: 'FileClock', selected: true, size: 1.84 * GB, count: 4821, items: tempPaths(`${LOCAL}\\Temp`, 24) },
  { id: 'systemTemp', name: 'システム一時ファイル', desc: 'Windows が使用した一時ファイル', icon: 'Cpu', admin: true, selected: true, size: 612 * MB, count: 1290, items: tempPaths('C:\\Windows\\Temp', 18) },
  { id: 'browserCache', name: 'ブラウザキャッシュ', desc: 'Chrome / Edge / Firefox などのキャッシュ', icon: 'Globe', selected: true, size: 2.31 * GB, count: 15402, items: [...tempPaths(`${LOCAL}\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data`, 12, 'dat'), ...tempPaths(`${LOCAL}\\Microsoft\\Edge\\User Data\\Default\\Code Cache\\js`, 10, 'dat')] },
  { id: 'appCache', name: 'アプリケーションキャッシュ', desc: 'Discord・Slack・Teams・VS Code などのキャッシュ', icon: 'AppWindow', selected: true, size: 945 * MB, count: 3310, items: tempPaths(`${U}\\AppData\\Roaming\\discord\\Cache\\Cache_Data`, 16, 'dat') },
  { id: 'shaderCache', name: 'シェーダー・GPU キャッシュ', desc: 'DirectX / NVIDIA / AMD / Intel が生成するキャッシュ', icon: 'Gpu', selected: true, size: 1.12 * GB, count: 892, items: tempPaths(`${LOCAL}\\NVIDIA\\DXCache`, 14, 'nvph') },
  { id: 'logs', name: 'ログファイル', desc: '7 日以上前の Windows・アプリのログ', icon: 'ScrollText', admin: true, selected: true, size: 318 * MB, count: 744, items: tempPaths('C:\\Windows\\Logs\\CBS', 12, 'log') },
  { id: 'crashReports', name: 'クラッシュレポート・ダンプ', desc: 'エラー報告とメモリダンプファイル', icon: 'Bug', selected: true, size: 806 * MB, count: 58, items: tempPaths(`${LOCAL}\\CrashDumps`, 8, 'dmp') },
  { id: 'updateCache', name: 'Windows Update キャッシュ', desc: 'インストール済み更新プログラムのダウンロードファイル', icon: 'RefreshCw', admin: true, selected: true, size: 3.42 * GB, count: 412, items: tempPaths('C:\\Windows\\SoftwareDistribution\\Download', 14, 'cab') },
  { id: 'devCache', name: '開発ツールのキャッシュ', desc: 'npm / pip / NuGet / Yarn などのパッケージキャッシュ', icon: 'Code', selected: false, size: 4.07 * GB, count: 61204, items: tempPaths(`${LOCAL}\\npm-cache\\_cacache\\content-v2`, 12, 'tgz') },
  { id: 'recycleBin', name: 'ごみ箱', desc: '削除済みファイルを完全に消去します', icon: 'Trash2', selected: true, size: 1.27 * GB, count: 214, items: [] },
];

const PRIVACY: PrivacyGroup[] = [
  { name: 'Google Chrome', running: false, traces: [
    { id: 'chrome:history', name: '閲覧履歴', desc: '訪問したサイトとダウンロード履歴', size: 48 * MB, count: 7, selected: true },
    { id: 'chrome:cookies', name: 'Cookie', desc: 'ログイン状態などのサイトデータ（再ログインが必要になります）', size: 6.2 * MB, count: 2, selected: false },
    { id: 'chrome:sessions', name: 'セッション・タブ', desc: '前回開いていたタブの情報', size: 3.1 * MB, count: 12, selected: true },
    { id: 'chrome:autofill', name: 'フォーム入力履歴', desc: 'フォームの自動入力候補や保存した住所など（パスワードは削除しません）', size: 1.4 * MB, count: 2, selected: false },
  ] },
  { name: 'Microsoft Edge', running: true, traces: [
    { id: 'edge:history', name: '閲覧履歴', desc: '訪問したサイトとダウンロード履歴', size: 22 * MB, count: 6, selected: true },
    { id: 'edge:cookies', name: 'Cookie', desc: 'ログイン状態などのサイトデータ（再ログインが必要になります）', size: 2.8 * MB, count: 2, selected: false },
    { id: 'edge:sessions', name: 'セッション・タブ', desc: '前回開いていたタブの情報', size: 1.2 * MB, count: 8, selected: true },
  ] },
  { name: 'Windows', running: false, traces: [
    { id: 'Windows:recent', name: '最近使ったファイル', desc: 'エクスプローラーとジャンプリストの履歴', size: 4.6 * MB, count: 318, selected: true },
    { id: 'Windows:runmru', name: '「ファイル名を指定して実行」の履歴', desc: 'Win+R で入力したコマンド', size: 0, count: 1, selected: true, special: true },
    { id: 'Windows:clipboard', name: 'クリップボード', desc: '現在コピーされている内容', size: 0, count: 1, selected: false, special: true },
    { id: 'Windows:dns', name: 'DNS キャッシュ', desc: '最近アクセスしたドメインの記録', size: 0, count: 1, selected: true, special: true },
  ] },
];

const st = (name: string, description: string, company: string, enabled: boolean, scope: 'user' | 'machine' = 'user', source: 'registry' | 'folder' = 'registry'): StartupItem => ({
  name, description, company, enabled, scope, source, command: `"C:\\Program Files\\${company}\\${name}.exe" --background`, exe: `C:\\Program Files\\${company}\\${name}.exe`, hive: scope === 'user' ? 'HKCU:' : 'HKLM:', approvedKey: 'Run',
});
let STARTUP: StartupItem[] = [
  st('Discord', 'Discord', 'Discord Inc.', true),
  st('Spotify', 'Spotify', 'Spotify Ltd', true),
  st('OneDrive', 'Microsoft OneDrive', 'Microsoft Corporation', true),
  st('Steam', 'Steam Client Bootstrapper', 'Valve Corporation', true),
  st('SecurityHealth', 'Windows Security notification icon', 'Microsoft Corporation', true, 'machine'),
  st('RtkAudUService', 'Realtek HD Audio Universal Service', 'Realtek Semiconductor', true, 'machine'),
  st('EpicGamesLauncher', 'Epic Games Launcher', 'Epic Games, Inc.', false),
  st('Teams', 'Microsoft Teams', 'Microsoft Corporation', false),
  st('Notion.lnk', 'Notion', 'Notion Labs, Inc.', true, 'user', 'folder'),
  st('AdobeGCInvoker-1.0', 'Adobe GC Invoker Utility', 'Adobe Inc.', true, 'machine'),
];

const app = (name: string, publisher: string, version: string, sizeMb: number, daysAgo: number): InstalledApp => {
  const d = new Date(Date.now() - daysAgo * DAY);
  return { id: `${name}|demo`, name, publisher, version, size: sizeMb * MB, installDate: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`, uninstall: '', icon: '', location: `C:\\Program Files\\${name}`, scope: 'machine' };
};
let APPS: InstalledApp[] = [
  app('Adobe Acrobat (64-bit)', 'Adobe', '24.003.20180', 1240, 210),
  app('Blender', 'Blender Foundation', '4.2.1', 812, 90),
  app('Discord', 'Discord Inc.', '1.0.9163', 380, 400),
  app('Docker Desktop', 'Docker Inc.', '4.34.2', 2300, 45),
  app('Epic Games Launcher', 'Epic Games, Inc.', '1.3.93', 420, 600),
  app('GIMP 2.10.38', 'The GIMP Team', '2.10.38', 410, 760),
  app('Google Chrome', 'Google LLC', '129.0.6668.90', 520, 30),
  app('Microsoft Office Home 2024', 'Microsoft Corporation', '16.0.18025', 3900, 120),
  app('Microsoft Visual Studio Code', 'Microsoft Corporation', '1.94.0', 360, 12),
  app('Mozilla Firefox (x64 ja)', 'Mozilla', '131.0', 240, 150),
  app('Node.js', 'Node.js Foundation', '22.9.0', 92, 60),
  app('OBS Studio', 'OBS Project', '30.2.3', 520, 300),
  app('Python 3.12.6 (64-bit)', 'Python Software Foundation', '3.12.6', 110, 80),
  app('Slack', 'Slack Technologies Inc.', '4.40.128', 450, 210),
  app('Spotify', 'Spotify AB', '1.2.47', 310, 500),
  app('Steam', 'Valve Corporation', '2.10.91.91', 640, 900),
  app('VLC media player', 'VideoLAN', '3.0.21', 170, 1100),
  app('Zoom Workplace', 'Zoom Video Communications, Inc.', '6.2.3', 280, 40),
  app('7-Zip 24.08 (x64)', 'Igor Pavlov', '24.08', 6, 200),
];

const kindNames: [LargeFile['kind'], string, string][] = [
  ['video', 'Videos', 'mp4'], ['installer', 'Downloads', 'iso'], ['archive', 'Downloads', 'zip'], ['video', 'Videos', 'mkv'],
  ['installer', 'Downloads', 'exe'], ['image', 'Pictures', 'psd'], ['document', 'Documents', 'pdf'], ['audio', 'Music', 'flac'],
];
const LARGE: LargeFile[] = [
  'Windows11_InsiderPreview_Client_x64_ja-jp.iso', '2024_家族旅行_沖縄.mp4', 'プロジェクト素材_バックアップ.zip', '結婚式ムービー_編集前.mkv',
  'VisualStudioSetup_offline.exe', 'ポスターデザイン_最終.psd', '会議録画_2023-11-02.mp4', 'Ubuntu-24.04-desktop-amd64.iso', 'ゲーム実況_未編集.mp4',
  'old_laptop_backup.7z', '写真アーカイブ_2019.zip', 'ライブ音源_ハイレゾ.flac', 'スキャン資料_全巻.pdf', 'Unity_Hub_Setup.exe', 'drone_footage_4k.mov',
  'VM_Windows10.vhdx', 'DaVinci_Resolve_Installer.zip', '卒業アルバム_高解像度.tif',
].map((name, i) => {
  const [kind, folder] = kindNames[i % kindNames.length];
  const ext = name.split('.').pop()!;
  const k: LargeFile['kind'] = /mp4|mkv|mov/.test(ext) ? 'video' : /iso|exe|vhdx/.test(ext) ? 'installer' : /zip|7z/.test(ext) ? 'archive' : /psd|tif/.test(ext) ? 'image' : /flac/.test(ext) ? 'audio' : /pdf/.test(ext) ? 'document' : kind;
  const age = [20, 400, 900, 60, 700, 30, 330, 120, 15, 1500, 1200, 500, 800, 260, 45, 640, 380, 2100][i];
  const dir = ({ video: 'Videos', installer: 'Downloads', archive: 'Downloads', image: 'Pictures', audio: 'Music', document: 'Documents', other: folder } as Record<string, string>)[k];
  return { name, path: `${U}\\${dir}\\${name}`, size: Math.round(rnd(60, i < 4 ? 6200 : 2400) * MB), mtime: Date.now() - age * DAY, atime: Date.now() - age * DAY * 0.8, kind: k };
}).sort((a, b) => b.size - a.size);

const DUPS: DupGroup[] = [
  ['IMG_2041.JPG', 'image', 4.8 * MB, ['Pictures\\iPhone', 'Pictures\\バックアップ', 'Desktop']],
  ['プレゼン資料_v3.pptx', 'document', 18 * MB, ['Documents\\仕事', 'Downloads']],
  ['setup_tool.exe', 'installer', 86 * MB, ['Downloads', 'Downloads\\old', 'Desktop\\インストーラ']],
  ['夏祭り.mp4', 'video', 412 * MB, ['Videos', 'Videos\\コピー']],
  ['contract_signed.pdf', 'document', 2.2 * MB, ['Documents', 'Downloads']],
  ['background_music.mp3', 'audio', 7.6 * MB, ['Music', 'Documents\\動画素材']],
  ['assets_2023.zip', 'archive', 230 * MB, ['Downloads', 'Documents\\アーカイブ']],
  ['DSC_0098.NEF', 'image', 26 * MB, ['Pictures\\Nikon', 'Pictures\\RAW_取込']],
].map(([name, kind, size, dirs], gi) => ({
  id: `g${gi}`, name: name as string, kind: kind as DupGroup['kind'], size: Math.round(size as number),
  files: (dirs as string[]).map((d, i) => ({ name: name as string, path: `${U}\\${d}\\${name}`, size: Math.round(size as number), mtime: Date.now() - (300 - i * 90 - gi * 7) * DAY, kind: kind as DupGroup['kind'] })),
}));

function genSpace(): SpaceNode {
  const mk = (name: string, path: string, size: number, children?: [string, number, [string, number][]?][]): SpaceNode => ({
    name, path, type: 'dir', size, count: Math.round(size / (2 * MB)), hasChildren: true,
    children: children?.sort((a, b) => b[1] - a[1]).map(([n, s, sub]) => sub ? mk(n, `${path}\\${n}`, s, sub.map(([a, b]) => [a, b] as [string, number])) : { name: n, path: `${path}\\${n}`, type: /\.\w+$/.test(n) ? 'file' : 'dir', size: s, count: 1, hasChildren: !/\.\w+$/.test(n) }),
  });
  return mk('C:', 'C:\\', 412 * GB, [
    ['Users', 186 * GB, [['tomo', 178 * GB], ['Public', 6 * GB], ['Default', 2 * GB]]],
    ['Program Files', 74 * GB, [['Epic Games', 38 * GB], ['Docker', 9 * GB], ['Microsoft Office', 6 * GB], ['Adobe', 5 * GB], ['NVIDIA Corporation', 3 * GB], ['Blender Foundation', 1.2 * GB]]],
    ['Windows', 38 * GB, [['WinSxS', 14 * GB], ['System32', 9 * GB], ['SoftwareDistribution', 3.4 * GB], ['Installer', 5 * GB], ['SysWOW64', 2 * GB]]],
    ['Program Files (x86)', 52 * GB, [['Steam', 44 * GB], ['Microsoft', 4 * GB], ['Google', 1.6 * GB]]],
    ['ProgramData', 18 * GB, [['Microsoft', 7 * GB], ['Package Cache', 6 * GB], ['NVIDIA', 2 * GB]]],
    ['hiberfil.sys', 12.7 * GB],
    ['pagefile.sys', 16 * GB],
    ['XboxGames', 12 * GB, [['Forza Horizon 5', 12 * GB]]],
    ['swapfile.sys', 0.25 * GB],
  ]);
}
const userTree = (path: string, name: string, size: number): SpaceNode => ({
  name, path, type: 'dir', size, count: 9000, hasChildren: true,
  children: [
    ['Videos', 0.31], ['AppData', 0.26], ['Downloads', 0.16], ['Pictures', 0.12], ['Documents', 0.08], ['OneDrive', 0.04], ['Music', 0.02], ['Desktop', 0.01],
  ].map(([n, r]) => ({ name: n as string, path: `${path}\\${n}`, type: 'dir' as const, size: Math.round(size * (r as number)), count: 1200, hasChildren: true })),
});

export function createMockApi(): CleaneeApi {
  let memFree = 7.2 * GB;
  let space = genSpace();
  const SKEY = 'cleanee-demo-settings';
  const defaults: Settings = { trayEnabled: true, launchAtLogin: false, lowDiskAlert: true, tempAgeHours: 24, excludes: [], motion: 'auto', theme: 'system', totalFreed: 48.6 * GB, cleanCount: 12, lastClean: Date.now() - 6 * DAY };
  const loadSettings = (): Settings => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch { return defaults; } };
  const saveSettings = (patch: Partial<Settings>) => {
    const s = { ...loadSettings(), ...patch };
    try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
    return s;
  };
  return {
    demo: true,
    env: { platform: navigator.platform, version: __APP_VERSION__, material: false },
    onNavigate: () => () => {},
    getSettings: async () => loadSettings(),
    setSettings: async (patch) => saveSettings(patch),
    addFreed: async (bytes) => { const s = loadSettings(); return saveSettings({ totalFreed: s.totalFreed + bytes, cleanCount: s.cleanCount + 1, lastClean: Date.now() }); },
    onProgress: (task, cb) => {
      const arr = listeners.get(task) || [];
      arr.push(cb);
      listeners.set(task, arr);
      return () => listeners.set(task, (listeners.get(task) || []).filter((x) => x !== cb));
    },
    cancel: async (task) => { cancelled.add(task); },
    systemInfo: async () => {
      memFree = Math.max(2 * GB, Math.min(12 * GB, memFree + rnd(-0.3, 0.3) * GB));
      return {
        hostname: 'DESKTOP-CLEANEE', user: 'tomo', os: 'Microsoft Windows 11 Pro', build: '26100', cpuModel: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 16, admin: false,
        cpu: rnd(0.08, 0.32), memTotal: 32 * GB, memFree, uptime: 3 * 86400 + 5 * 3600,
        drives: [
          { mount: 'C:\\', label: 'Windows', total: 953 * GB, free: 541 * GB, system: true },
          { mount: 'D:\\', label: 'データ', total: 1863 * GB, free: 1220 * GB },
          { mount: 'E:\\', label: 'SanDisk Extreme', total: 931 * GB, free: 402 * GB, external: true },
        ],
      };
    },
    relaunchAdmin: async () => false,
    homeFolders: async () => ['desktop', 'documents', 'downloads', 'pictures', 'videos', 'music'].map((k) => ({ key: k, path: `${U}\\${k[0].toUpperCase()}${k.slice(1)}` })),
    pickFolders: async () => [`${U}\\Documents`],
    reveal: async () => {},
    fileIcon: async () => null,
    trash: async (paths) => {
      await wait(600);
      let freed = 0;
      for (const p of paths) {
        const f = LARGE.find((x) => x.path === p) || DUPS.flatMap((g) => g.files).find((x) => x.path === p);
        if (f) freed += f.size;
      }
      return { ok: paths.length, failed: 0, freed };
    },

    junkScan: async () => {
      let total = 0;
      const steps = JUNK.flatMap((c) => c.items.slice(0, 6).map((it) => ({ c, it })));
      const ok = await simulate('junk', steps.map((s) => s.it.path), 4200, (i) => {
        const { c } = steps[i];
        total += c.size / 6;
        return { category: c.id, current: steps[i].it.path.replace(/\\[^\\]+$/, ''), total };
      });
      return ok ? JSON.parse(JSON.stringify(JUNK)) : [];
    },
    junkClean: async (ids, excluded = []) => {
      for (let i = 0; i < ids.length; i++) { emit('junk-clean', { category: ids[i], index: i + 1, count: ids.length }); await wait(380); }
      const freed = JUNK.filter((c) => ids.includes(c.id)).reduce((a, c) => a + c.size, 0);
      const ex = JUNK.flatMap((c) => c.items).filter((it) => excluded.includes(it.path)).reduce((a, it) => a + it.size, 0);
      return { freed: freed * 0.97 - ex, removed: 9800, failed: 37 };
    },
    privacyScan: async () => { await wait(900); return JSON.parse(JSON.stringify(PRIVACY)); },
    privacyClean: async (ids) => {
      await wait(1100);
      const all = PRIVACY.flatMap((g) => g.traces);
      return { freed: all.filter((t) => ids.includes(t.id)).reduce((a, t) => a + t.size, 0), removed: ids.length * 12, failed: 0 };
    },
    startupList: async () => { await wait(700); return STARTUP.map((s) => ({ ...s })); },
    startupToggle: async (item, enable) => {
      await wait(250);
      if (item.scope === 'machine') return { ok: false, error: 'この項目の変更には管理者権限が必要です。' };
      STARTUP = STARTUP.map((s) => (s.name === item.name ? { ...s, enabled: enable } : s));
      return { ok: true };
    },
    appsList: async () => { await wait(800); return APPS.map((a) => ({ ...a })); },
    appIcon: async () => null,
    appIconByName: async () => null,
    appUninstall: async (id) => { await wait(400); APPS = APPS.filter((a) => a.id !== id); return { ok: true }; },
    appInstalled: async (id) => APPS.some((a) => a.id === id),
    appLeftovers: async (id) => {
      const name = id.split('|')[0];
      return [
        { path: `${U}\\AppData\\Roaming\\${name}`, size: 182 * MB, count: 412 },
        { path: `${U}\\AppData\\Local\\${name}`, size: 64 * MB, count: 96 },
      ];
    },
    largeScan: async () => {
      const ok = await simulate('large', LARGE.map((f) => f.path.replace(/\\[^\\]+$/, '')), 2600, (i, p) => ({ current: p, scanned: (i + 1) * 3711, found: i + 1 }));
      return ok ? LARGE.map((f) => ({ ...f })) : [];
    },
    dupScan: async () => {
      const paths = DUPS.flatMap((g) => g.files.map((f) => f.path));
      const half = Math.floor(paths.length / 2);
      const ok = await simulate('dup', paths, 3000, (i, p) => (i < half
        ? { stage: 'collect', current: p, scanned: (i + 1) * 2410 }
        : { stage: 'hash', current: p, bytes: (i - half + 1) * 96 * MB, totalBytes: (paths.length - half) * 96 * MB }));
      return ok ? JSON.parse(JSON.stringify(DUPS)) : [];
    },
    spaceScan: async (root) => {
      const dirs = (space.children || []).map((c) => c.path);
      let bytes = 0;
      const ok = await simulate('space', [...dirs, ...dirs.map((d) => d + '\\…')], 3400, (_i, p) => { bytes += space.size / (dirs.length * 2); return { current: p, bytes, files: Math.round(bytes / (2 * MB)) }; });
      if (!ok) return space;
      if (root.startsWith('D')) return { ...userTree('D:\\', 'D:', 643 * GB), path: 'D:\\' };
      return space;
    },
    spaceNode: async (p) => {
      await wait(150);
      const find = (n: SpaceNode): SpaceNode | null => {
        if (n.path === p) return n;
        for (const c of n.children || []) { const r = find(c); if (r) return r; }
        return null;
      };
      const n = find(space);
      if (n && (!n.children || !n.children.length) && n.type === 'dir') return userTree(n.path, n.name, n.size);
      return n;
    },
    runTask: async (id) => {
      await wait(id === 'freeRam' ? 1800 : 1200);
      const msgs: Record<string, string> = {
        freeRam: '214 個のプロセスのメモリを整理しました', flushDns: 'DNS キャッシュを消去しました', rebuildThumbs: '6 個のキャッシュファイルを再構築しました',
        restartExplorer: 'エクスプローラーを再起動しました', restorePoint: '復元ポイントの作成を開始しました', trim: 'ドライブの最適化を開始しました',
        sfc: 'システムファイルの検査を開始しました', dism: 'Windows イメージの修復を開始しました', componentCleanup: 'コンポーネントストアのクリーンアップを開始しました', chkdsk: 'ディスクのエラーチェックを開始しました',
      };
      if (id === 'freeRam') { memFree += 1.6 * GB; return { ok: true, message: msgs[id], freed: 1.6 * GB }; }
      return { ok: true, message: msgs[id] || '完了しました', freed: id === 'rebuildThumbs' ? 182 * MB : undefined };
    },
    defenderStatus: async () => {
      await wait(700);
      return {
        available: true, antivirus: true, realtime: true, service: true, signatureAge: 0, signatureVersion: '1.419.212.0', signatureUpdated: Date.now() - 5 * 3600000,
        quickScanAge: 2, fullScanAge: 41, lastQuickScan: Date.now() - 2 * DAY,
        threats: [{ id: '2147735505', name: 'PUA:Win32/Presenoker', severity: 1, resources: [`file:_${U}\\Downloads\\free_converter_setup.exe`], time: Date.now() - 12 * DAY, status: 3 }],
      };
    },
    defenderScan: async () => {
      await simulate('defender', Array.from({ length: 40 }, (_, i) => String(i)), 6000, (i) => ({ i }));
      return { ok: true, threats: false };
    },
    defenderUpdate: async () => { await wait(1600); return { ok: true }; },
    defenderRemove: async () => { await wait(1200); return { ok: true }; },
    updatesList: async () => {
      await wait(1400);
      const items: UpdateItem[] = [
        { name: 'Google Chrome', id: 'Google.Chrome', version: '129.0.6668.90', available: '130.0.6723.59', source: 'winget' },
        { name: 'Microsoft Visual Studio Code', id: 'Microsoft.VisualStudioCode', version: '1.94.0', available: '1.94.2', source: 'winget' },
        { name: 'Discord', id: 'Discord.Discord', version: '1.0.9163', available: '1.0.9167', source: 'winget' },
        { name: '7-Zip 24.08 (x64)', id: '7zip.7zip', version: '24.08', available: '24.09', source: 'winget' },
        { name: 'Node.js', id: 'OpenJS.NodeJS', version: '22.9.0', available: '22.10.0', source: 'winget' },
        { name: 'Zoom Workplace', id: 'Zoom.Zoom', version: '6.2.3', available: '6.2.5', source: 'winget' },
      ];
      return { available: true, items };
    },
    updateInstall: async () => { await wait(rnd(1800, 3200)); return { ok: true, message: '' }; },
  };
}
