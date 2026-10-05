export interface Drive { mount: string; label: string; total: number; free: number; system?: boolean; external?: boolean }

export interface SystemInfo {
  hostname: string; user: string; os: string; build: string; cpuModel: string; cores: number; admin: boolean;
  cpu: number; memTotal: number; memFree: number; uptime: number; drives: Drive[];
}

export interface FileEntry { path: string; size: number }

export interface JunkCategory {
  id: string; name: string; desc: string; icon: string; admin?: boolean; selected: boolean;
  size: number; count: number; items: FileEntry[];
}
export interface JunkProgress { category: string; current?: string; total: number; done?: string }
export interface CleanResult { freed: number; removed: number; failed: number }

export interface PrivacyTrace { id: string; name: string; desc: string; size: number; count: number; selected: boolean; special?: boolean }
export interface PrivacyGroup { name: string; running: boolean; traces: PrivacyTrace[] }

export interface StartupItem {
  name: string; command: string; exe: string; description: string; company: string;
  source: 'registry' | 'folder'; hive: string; approvedKey: string; scope: 'user' | 'machine'; enabled: boolean;
}

export interface InstalledApp {
  id: string; name: string; version: string; publisher: string; installDate: string; size: number;
  uninstall: string; icon: string; location: string; scope: 'user' | 'machine';
}
export interface Leftover { path: string; size: number; count: number }

export type FileKind = 'video' | 'audio' | 'image' | 'archive' | 'installer' | 'document' | 'other';
export interface LargeFile { path: string; name: string; size: number; mtime: number; atime: number; kind: FileKind }
export interface DupFile { path: string; name: string; size: number; mtime: number; kind: FileKind }
export interface DupGroup { id: string; size: number; name: string; kind: FileKind; files: DupFile[] }

export interface SpaceNode {
  name: string; path: string; type: 'dir' | 'file' | 'other'; size: number; count: number;
  hasChildren?: boolean; children?: SpaceNode[];
}

export interface TaskResult { ok: boolean; message: string; freed?: number }

export interface DefenderThreat { id: string; name: string; severity: number; resources: string[]; time: number; status: number }
export interface DefenderStatus {
  available: boolean; antivirus?: boolean; realtime?: boolean; service?: boolean;
  signatureAge?: number; signatureVersion?: string; signatureUpdated?: number;
  quickScanAge?: number; fullScanAge?: number; lastQuickScan?: number; threats?: DefenderThreat[];
}

export interface UpdateItem { name: string; id: string; version: string; available: string; source: string }

export interface Settings {
  trayEnabled: boolean; launchAtLogin: boolean; lowDiskAlert: boolean; tempAgeHours: number; excludes: string[]; motion: 'auto' | 'on' | 'off'; theme: 'system' | 'light' | 'dark';
  totalFreed: number; cleanCount: number; lastClean: number;
}

export interface AppEnv { platform: string; version: string; material: boolean }

export interface CleaneeApi {
  demo: boolean;
  env: AppEnv;
  onNavigate(cb: (page: string) => void): () => void;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  addFreed(bytes: number): Promise<Settings>;
  onProgress<T = any>(task: string, cb: (data: T) => void): () => void;
  cancel(task: string): Promise<void>;
  systemInfo(): Promise<SystemInfo>;
  relaunchAdmin(): Promise<boolean>;
  homeFolders(): Promise<{ key: string; path: string }[]>;
  pickFolders(): Promise<string[]>;
  reveal(path: string): Promise<void>;
  fileIcon(path: string): Promise<string | null>;
  trash(paths: string[]): Promise<{ ok: number; failed: number; freed: number }>;

  junkScan(): Promise<JunkCategory[]>;
  junkClean(ids: string[], excluded?: string[]): Promise<CleanResult>;
  privacyScan(): Promise<PrivacyGroup[]>;
  privacyClean(ids: string[]): Promise<CleanResult>;
  startupList(): Promise<StartupItem[]>;
  startupToggle(item: StartupItem, enable: boolean): Promise<{ ok: boolean; error?: string }>;
  appsList(): Promise<InstalledApp[]>;
  appIcon(id: string): Promise<string | null>;
  appIconByName(name: string): Promise<string | null>;
  appUninstall(id: string): Promise<{ ok: boolean; error?: string }>;
  appInstalled(id: string): Promise<boolean>;
  appLeftovers(id: string): Promise<Leftover[]>;
  largeScan(opts: { roots?: string[]; minSize?: number }): Promise<LargeFile[]>;
  dupScan(opts: { roots?: string[]; minSize?: number }): Promise<DupGroup[]>;
  spaceScan(root: string): Promise<SpaceNode>;
  spaceNode(path: string): Promise<SpaceNode | null>;
  runTask(id: string): Promise<TaskResult>;
  defenderStatus(): Promise<DefenderStatus>;
  defenderScan(type: 'quick' | 'full'): Promise<{ ok: boolean; threats: boolean }>;
  defenderUpdate(): Promise<{ ok: boolean }>;
  defenderRemove(): Promise<{ ok: boolean }>;
  updatesList(): Promise<{ available: boolean; items: UpdateItem[] }>;
  updateInstall(id: string): Promise<{ ok: boolean; message: string }>;
}
