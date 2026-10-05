import type { CleaneeApi } from './types';
import { createMockApi } from './mock';

interface Bridge {
  invoke(channel: string, ...args: unknown[]): Promise<any>;
  onProgress(task: string, cb: (data: any) => void): () => void;
  onNavigate(cb: (page: string) => void): () => void;
}

declare global {
  interface Window { cleanee?: Bridge }
}

function createBridgeApi(b: Bridge, env: CleaneeApi['env']): CleaneeApi {
  const i = b.invoke;
  return {
    demo: false,
    env,
    onProgress: (task, cb) => b.onProgress(task, cb),
    onNavigate: (cb) => b.onNavigate(cb),
    getSettings: () => i('settings:get'),
    setSettings: (patch) => i('settings:set', patch),
    addFreed: (bytes) => i('stats:addFreed', bytes),
    cancel: (task) => i('task:cancel', task),
    systemInfo: () => i('system:info'),
    relaunchAdmin: () => i('system:relaunchAdmin'),
    homeFolders: () => i('system:homeFolders'),
    pickFolders: () => i('dialog:folder'),
    reveal: (p) => i('shell:reveal', p),
    fileIcon: (p) => i('file:icon', p),
    trash: (paths) => i('files:trash', paths),
    junkScan: () => i('junk:scan'),
    junkClean: (ids, excluded) => i('junk:clean', ids, excluded || []),
    privacyScan: () => i('privacy:scan'),
    privacyClean: (ids) => i('privacy:clean', ids),
    startupList: () => i('startup:list'),
    startupToggle: (item, enable) => i('startup:toggle', item, enable),
    appsList: () => i('apps:list'),
    appIcon: (id) => i('apps:icon', id),
    appIconByName: (name) => i('apps:iconByName', name),
    appUninstall: (id) => i('apps:uninstall', id),
    appInstalled: (id) => i('apps:installed', id),
    appLeftovers: (id) => i('apps:leftovers', id),
    largeScan: (opts) => i('large:scan', opts),
    dupScan: (opts) => i('dup:scan', opts),
    spaceScan: (root) => i('space:scan', root),
    spaceNode: (p) => i('space:node', p),
    runTask: (id) => i('maint:run', id),
    defenderStatus: () => i('defender:status'),
    defenderScan: (type) => i('defender:scan', type),
    defenderUpdate: () => i('defender:update'),
    defenderRemove: () => i('defender:remove'),
    updatesList: () => i('updates:list'),
    updateInstall: (id) => i('updates:install', id),
  };
}

async function init(): Promise<CleaneeApi> {
  const bridge = window.cleanee;
  if (bridge) {
    const env = await bridge.invoke('env');
    const appEnv = { platform: env.platform, version: env.version, material: !!env.material };
    if (!env.demo) return createBridgeApi(bridge, appEnv);
    // Non-Windows Electron: demo data, but real folder dialogs / reveal.
    const mock = createMockApi();
    return {
      ...mock,
      env: appEnv,
      reveal: (p) => bridge.invoke('shell:reveal', p),
      pickFolders: () => bridge.invoke('dialog:folder'),
      onNavigate: (cb) => bridge.onNavigate(cb),
      getSettings: () => bridge.invoke('settings:get'),
      setSettings: (patch) => bridge.invoke('settings:set', patch),
      addFreed: (bytes) => bridge.invoke('stats:addFreed', bytes),
    };
  }
  return createMockApi();
}

export const apiReady = init();
export let api: CleaneeApi;
apiReady.then((a) => { api = a; });
