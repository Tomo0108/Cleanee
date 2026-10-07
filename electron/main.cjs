'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const settings = require('./lib/settings.cjs');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
// Native window material (macOS vibrancy / Windows 11 22H2+ Acrylic). Disabled until it has been
// checked on real hardware: the CSS glass is drawn by the app itself and looks the same everywhere.
const USE_NATIVE_MATERIAL = false;
const WIN_BUILD = IS_WIN ? Number(require('os').release().split('.')[2] || 0) : 0;
const HAS_MATERIAL = USE_NATIVE_MATERIAL && (IS_MAC || WIN_BUILD >= 22621);
const overlayFor = (dark) => ({ color: '#00000000', symbolColor: dark ? '#e8e8ed' : '#1d1d1f', height: 40 });
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
let win;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());
if (IS_WIN) app.setAppUserModelId('app.cleanee.desktop');

function createWindow({ hidden = false } = {}) {
  nativeTheme.themeSource = settings.get().theme || 'system';
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: HAS_MATERIAL ? '#00000000' : dark ? '#16171b' : '#f3f3f5',
    ...(IS_MAC ? { vibrancy: 'under-window', visualEffectState: 'followWindow' } : {}),
    ...(IS_WIN && HAS_MATERIAL ? { backgroundMaterial: 'acrylic' } : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: IS_WIN ? overlayFor(dark) : false,
    trafficLightPosition: { x: 16, y: 13 },
    show: false,
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (!hidden) win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // Closing the window keeps the app in the notification area when enabled.
  win.on('close', (e) => {
    if (!quitting && tray && settings.get().trayEnabled) { e.preventDefault(); win.hide(); }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function showWindow(page) {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (page) win.webContents.send('navigate', page);
}

/* ---------------- Tray ---------------- */

function trayImage() {
  const img = nativeImage.createFromPath(ICON);
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 });
}

async function refreshTray() {
  const s = settings.get();
  if (!s.trayEnabled) { tray?.destroy(); tray = null; return; }
  if (!tray) {
    tray = new Tray(trayImage());
    tray.setToolTip('Cleanee');
    tray.on('click', () => showWindow());
  }
  let diskLabel = '';
  if (IS_WIN) {
    try {
      const st = await require('fs').promises.statfs((process.env.SystemDrive || 'C:') + '\\');
      diskLabel = `ディスク空き: ${(st.bavail * st.bsize / 1024 ** 3).toFixed(1)} GB`;
    } catch { /* ignore */ }
  }
  const items = [
    { label: 'Cleanee を開く', click: () => showWindow() },
    { label: 'スマートスキャン', click: () => showWindow('smart') },
    { type: 'separator' },
  ];
  if (IS_WIN) {
    items.push({
      label: 'メモリを解放',
      click: async () => {
        const r = await require('./lib/system.cjs').runTask('freeRam');
        notify('メモリを解放しました', r.message);
      },
    });
  }
  if (diskLabel) items.push({ label: diskLabel, enabled: false });
  items.push({ type: 'separator' }, { label: '終了', click: () => { quitting = true; app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON, silent: true });
  n.on('click', () => showWindow());
  n.show();
}

let lastDiskAlert = 0;
async function checkDisk() {
  if (!IS_WIN || !settings.get().lowDiskAlert) return;
  try {
    const st = await require('fs').promises.statfs((process.env.SystemDrive || 'C:') + '\\');
    const ratio = st.bavail / st.blocks;
    if (ratio < 0.1 && Date.now() - lastDiskAlert > 24 * 3600 * 1000) {
      lastDiskAlert = Date.now();
      const n = new Notification({ title: 'ディスクの空き容量が少なくなっています', body: `空きは ${(ratio * 100).toFixed(0)}% です。クリックしてクリーンアップしましょう。`, icon: ICON });
      n.on('click', () => showWindow('junk'));
      n.show();
    }
  } catch { /* ignore */ }
  refreshTray();
}

function applyLoginItem() {
  if (!IS_WIN || !app.isPackaged) return;
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({ openAtLogin: settings.get().launchAtLogin, path: exe, args: ['--hidden'] });
}

// Keep the Windows caption buttons legible when the appearance changes.
nativeTheme.on('updated', () => {
  if (IS_WIN && win && !win.isDestroyed()) win.setTitleBarOverlay(overlayFor(nativeTheme.shouldUseDarkColors));
});

app.whenReady().then(() => {
  registerIpc();
  createWindow({ hidden: process.argv.includes('--hidden') });
  refreshTray();
  checkDisk();
  setInterval(checkDisk, 10 * 60 * 1000);
  app.on('activate', () => showWindow());
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!tray) app.quit(); });

ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (_e, patch) => {
  const s = settings.set(patch);
  if ('trayEnabled' in patch) refreshTray();
  if ('launchAtLogin' in patch) applyLoginItem();
  if ('theme' in patch) nativeTheme.themeSource = patch.theme;
  return s;
});
ipcMain.handle('stats:addFreed', (_e, bytes) => settings.addFreed(bytes));

/* ---------------- IPC ---------------- */

const controllers = new Map();

/** Wraps a long-running job: progress events + cancellation via task id. */
function job(task, fn) {
  return async (event, ...args) => {
    controllers.get(task)?.abort();
    const ac = new AbortController();
    controllers.set(task, ac);
    const send = (data) => { if (!event.sender.isDestroyed()) event.sender.send('progress', task, data); };
    try {
      return await fn(send, ac.signal, ...args);
    } finally {
      if (controllers.get(task) === ac) controllers.delete(task);
    }
  };
}

function registerIpc() {
  // Real implementations only exist for Windows; elsewhere the renderer uses demo data.
  ipcMain.handle('env', () => ({ platform: process.platform, demo: !IS_WIN, version: app.getVersion(), material: HAS_MATERIAL, electron: process.versions.electron }));
  if (!IS_WIN) return;

  const util = require('./lib/util.cjs');
  const junk = require('./lib/junk.cjs');
  const privacy = require('./lib/privacy.cjs');
  const startup = require('./lib/startup.cjs');
  const apps = require('./lib/apps.cjs');
  const files = require('./lib/files-host.cjs');
  const system = require('./lib/system.cjs');

  ipcMain.handle('task:cancel', (_e, task) => controllers.get(task)?.abort());

  ipcMain.handle('system:info', () => system.info());
  ipcMain.handle('system:relaunchAdmin', async () => {
    // Portable builds run from a temp folder; relaunch the original .exe instead.
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const args = app.isPackaged ? [] : [path.join(__dirname, '..')];
    const argList = args.length ? ` -ArgumentList '${args.map((a) => `"${a}"`).join(' ')}'` : '';
    const r = await util.ps(`try{ Start-Process -FilePath '${exe}' -Verb RunAs${argList} -ErrorAction Stop; 'ok' }catch{ 'cancel' }`);
    if (r.stdout.trim() === 'ok') app.quit();
    return r.stdout.trim() === 'ok';
  });

  ipcMain.handle('junk:scan', job('junk', (send, signal) => junk.scan(send, signal)));
  ipcMain.handle('junk:clean', job('junk-clean', (send, _s, ids, excluded) => junk.clean(ids, send, excluded)));

  ipcMain.handle('privacy:scan', () => privacy.scan());
  ipcMain.handle('privacy:clean', (_e, ids) => privacy.clean(ids));

  ipcMain.handle('startup:list', () => startup.list());
  ipcMain.handle('startup:toggle', (_e, item, enable) => startup.toggle(item, enable));

  ipcMain.handle('apps:list', () => apps.list());
  const iconFor = async (a) => {
    for (const p of a ? await apps.iconCandidates(a) : []) {
      try {
        const img = await app.getFileIcon(p, { size: 'large' });
        if (!img.isEmpty()) return img.toDataURL();
      } catch { /* try the next candidate */ }
    }
    return null;
  };
  ipcMain.handle('apps:icon', (_e, id) => iconFor(apps.getCached().find((x) => x.id === id)));
  ipcMain.handle('apps:iconByName', async (_e, name) => {
    if (!apps.getCached().length) await apps.list();
    return iconFor(apps.findByName(name));
  });
  ipcMain.handle('apps:uninstall', (_e, id) => apps.uninstall(id));
  ipcMain.handle('apps:installed', (_e, id) => apps.stillInstalled(id));
  ipcMain.handle('apps:leftovers', (_e, id) => apps.leftovers(id));

  ipcMain.handle('file:icon', async (_e, p) => {
    try { return (await app.getFileIcon(p, { size: 'normal' })).toDataURL(); } catch { return null; }
  });

  const withExcludes = (opts) => ({ ...(opts || {}), excludes: settings.get().excludes });
  ipcMain.handle('large:scan', job('large', (send, signal, opts) => files.scanLarge(withExcludes(opts), send, signal)));
  ipcMain.handle('dup:scan', job('dup', (send, signal, opts) => files.scanDuplicates(withExcludes(opts), send, signal)));
  ipcMain.handle('space:scan', job('space', (send, signal, root) => files.scanSpace(root, send, signal)));
  ipcMain.handle('space:node', (_e, p) => files.spaceNode(p));

  ipcMain.handle('files:trash', async (_e, paths) => {
    let ok = 0, failed = 0, freed = 0;
    const done = [];
    for (const p of paths) {
      try {
        const st = await require('fs').promises.stat(p).catch(() => null);
        await shell.trashItem(p);
        ok++; done.push(p);
        if (st && st.isFile()) freed += st.size;
      } catch { failed++; }
    }
    await files.spaceRemove(done).catch(() => {});
    return { ok, failed, freed };
  });

  ipcMain.handle('maint:run', (_e, id) => system.runTask(id));

  ipcMain.handle('defender:status', () => system.defenderStatus());
  ipcMain.handle('defender:scan', (_e, type) => system.defenderScan(type));
  ipcMain.handle('defender:update', () => system.defenderUpdate());
  ipcMain.handle('defender:remove', () => system.defenderRemoveThreats());

  ipcMain.handle('updates:list', () => system.listUpdates());
  ipcMain.handle('updates:install', (_e, id) => system.installUpdate(id));
}

/* Shared helpers that also work in demo mode */
ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('shell:open', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'multiSelections'] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('system:homeFolders', () => {
  const names = ['desktop', 'documents', 'downloads', 'pictures', 'videos', 'music'];
  return names.map((n) => { try { return { key: n, path: app.getPath(n) }; } catch { return null; } }).filter(Boolean);
});
