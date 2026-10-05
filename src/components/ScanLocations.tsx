import { Check, FolderPlus, HardDrive, Home, Usb, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../App';
import { prettyPath } from '../lib/format';

/**
 * Scan-target picker shown under the scan button: the user folder, every non-system drive
 * (external ones flagged) and any folders the user added. Value is a list of roots;
 * '~' stands for the user folder.
 */
export function ScanLocations({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { sys } = useApp();
  const drives = (sys?.drives || []).filter((d) => !d.system);
  const has = (r: string) => value.includes(r);
  const toggle = (r: string) => {
    const next = has(r) ? value.filter((x) => x !== r) : [...value, r];
    onChange(next.length ? next : ['~']);
  };
  const custom = value.filter((r) => r !== '~' && !drives.some((d) => d.mount === r));
  const add = async () => {
    const picked = await api.pickFolders();
    if (picked.length) onChange([...new Set([...value, ...picked])]);
  };

  return (
    <div className="locs" role="group" aria-label="検索場所">
      <button className={`loc ${has('~') ? 'on' : ''}`} onClick={() => toggle('~')} aria-pressed={has('~')}>
        {has('~') ? <Check size={12} strokeWidth={2.6} /> : <Home size={12} />}ユーザーフォルダ
      </button>
      {drives.map((d) => (
        <button key={d.mount} className={`loc ${has(d.mount) ? 'on' : ''}`} onClick={() => toggle(d.mount)} aria-pressed={has(d.mount)} title={`${d.label} (${d.mount})`}>
          {has(d.mount) ? <Check size={12} strokeWidth={2.6} /> : d.external ? <Usb size={12} /> : <HardDrive size={12} />}
          {d.mount.replace('\\', '')} {d.label}
          {d.external && <span className="loc-tag">外付け</span>}
        </button>
      ))}
      {custom.map((r) => (
        <span key={r} className="loc on">
          <Check size={12} strokeWidth={2.6} /><span className="mono">{prettyPath(r)}</span>
          <button className="loc-x" aria-label="外す" onClick={() => onChange(value.filter((x) => x !== r).length ? value.filter((x) => x !== r) : ['~'])}><X size={11} /></button>
        </span>
      ))}
      <button className="loc add" onClick={add}><FolderPlus size={12} />フォルダを追加</button>
    </div>
  );
}
