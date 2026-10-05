import {
  MonitorCheck, Trash2, Fingerprint, ShieldCheck, CircleGauge, Wrench, PackageX, RefreshCcw, ChartPie, FileStack, Copy,
  type LucideIcon,
} from 'lucide-react';

export type ModuleId =
  | 'smart' | 'junk' | 'privacy' | 'protection' | 'optimize' | 'maintenance'
  | 'uninstaller' | 'updater' | 'space' | 'large' | 'duplicates';

export interface ModuleDef {
  id: ModuleId;
  title: string;
  icon: LucideIcon;
  /** Tint per appearance: [dark, light] — Apple system colours. */
  colors: [string, string];
  group?: string;
}

export const MODULES: ModuleDef[] = [
  { id: 'smart', title: 'スマートスキャン', icon: MonitorCheck, colors: ['#a3e635', '#65a30d'] },
  { id: 'junk', title: 'システムジャンク', icon: Trash2, colors: ['#ff375f', '#ff2d55'], group: 'クリーンアップ' },
  { id: 'privacy', title: 'プライバシー', icon: Fingerprint, colors: ['#0a84ff', '#007aff'], group: 'クリーンアップ' },
  { id: 'protection', title: 'マルウェア対策', icon: ShieldCheck, colors: ['#30d158', '#28a745'], group: '保護' },
  { id: 'optimize', title: '最適化', icon: CircleGauge, colors: ['#ff9f0a', '#f08a00'], group: 'スピード' },
  { id: 'maintenance', title: 'メンテナンス', icon: Wrench, colors: ['#ffd60a', '#d4a500'], group: 'スピード' },
  { id: 'uninstaller', title: 'アンインストール', icon: PackageX, colors: ['#ff453a', '#ff3b30'], group: 'アプリケーション' },
  { id: 'updater', title: 'アップデート', icon: RefreshCcw, colors: ['#32ade6', '#1c9bd6'], group: 'アプリケーション' },
  { id: 'space', title: 'スペースレンズ', icon: ChartPie, colors: ['#7d7aff', '#5856d6'], group: 'ファイル' },
  { id: 'large', title: '大容量・古いファイル', icon: FileStack, colors: ['#bf5af2', '#af52de'], group: 'ファイル' },
  { id: 'duplicates', title: '重複ファイル', icon: Copy, colors: ['#ac8e68', '#a2845e'], group: 'ファイル' },
];

export const moduleById = (id: ModuleId) => MODULES.find((m) => m.id === id)!;

/** Text colour that stays legible on top of a tint (WCAG relative luminance). */
export function inkFor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.42 ? '#1d1d1f' : '#ffffff';
}

/** The module tint for the current appearance. */
export const tint = (m: ModuleDef, theme: 'dark' | 'light') => (theme === 'light' ? m.colors[1] : m.colors[0]);
