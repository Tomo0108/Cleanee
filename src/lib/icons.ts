import {
  FileClock, Cpu, Globe, AppWindow, MonitorCog, ScrollText, Bug, RefreshCw, Code, Trash2, Folder,
  Film, Music, Image, Archive, Disc3, FileText, File, type LucideIcon,
} from 'lucide-react';
import type { FileKind } from '../api/types';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  FileClock, Cpu, Globe, AppWindow, Gpu: MonitorCog, ScrollText, Bug, RefreshCw, Code, Trash2,
};
export const categoryIcon = (name: string) => CATEGORY_ICONS[name] || Folder;

/** System-colour squircle per junk category (like macOS System Settings). */
const CATEGORY_COLORS: Record<string, string> = {
  FileClock: '#8e8e93', Cpu: '#636366', Globe: '#0a84ff', AppWindow: '#5e5ce6', Gpu: '#bf5af2',
  ScrollText: '#ff9f0a', Bug: '#ff453a', RefreshCw: '#30b0c7', Code: '#ac8e68', Trash2: '#8e8e93',
};
export const categoryColor = (name: string) => CATEGORY_COLORS[name] || '#8e8e93';

export const KIND_META: Record<FileKind, { icon: LucideIcon; label: string; color: string }> = {
  video: { icon: Film, label: 'ムービー', color: '#ff453a' },
  audio: { icon: Music, label: 'ミュージック', color: '#ff375f' },
  image: { icon: Image, label: '画像', color: '#0a84ff' },
  archive: { icon: Archive, label: 'アーカイブ', color: '#ff9f0a' },
  installer: { icon: Disc3, label: 'インストーラ・イメージ', color: '#7d7aff' },
  document: { icon: FileText, label: 'ドキュメント', color: '#30d158' },
  other: { icon: File, label: 'その他', color: '#8e8e93' },
};
