import { useMemo, useState, type CSSProperties } from 'react';
import { FileStack, CalendarClock, FolderOpen, LayoutGrid, Search } from 'lucide-react';
import { HELP } from '../help';
import { api } from '../api';
import type { FileKind, LargeFile } from '../api/types';
import { useApp } from '../App';
import { formatBytes, formatNumber, timeAgo, prettyPath, dirname } from '../lib/format';
import { KIND_META } from '../lib/icons';
import { IdleHero, ScanningHero, ScanDock, PageHead, ListHead, Checkbox, Segmented, Modal, VirtualList, useProgress, useToast, ActionButton } from '../components/ui';
import { DoneHero } from '../components/Results';
import { ScanLocations } from '../components/ScanLocations';

type Phase = 'idle' | 'scanning' | 'results' | 'done';
type Age = 'all' | '6m' | '1y';
const DAY = 86400000;
const ROW = 56;

export default function LargeFiles() {
  const { setBadge, refreshSys, recordFreed } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [roots, setRoots] = useState<string[]>(['~']);
  const [minMb, setMinMb] = useState<'50' | '100' | '500' | '1024'>('100');
  const [files, setFiles] = useState<LargeFile[]>([]);
  const [prog, setProg] = useState<{ current?: string; scanned: number; found: number }>({ scanned: 0, found: 0 });
  const [kind, setKind] = useState<FileKind | 'all'>('all');
  const [age, setAge] = useState<Age>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [freed, setFreed] = useState(0);

  useProgress<typeof prog>('large', setProg);

  const scan = async () => {
    setPhase('scanning');
    setBadge('large', { busy: true });
    setProg({ scanned: 0, found: 0 });
    const r = await api.largeScan({ roots, minSize: Number(minMb) * 1024 * 1024 });
    setFiles(r);
    setSel(new Set());
    setPhase('results');
    setBadge('large', r.length ? { text: String(r.length) } : null);
  };


  const shown = useMemo(() => files.filter((f) => {
    if (kind !== 'all' && f.kind !== kind) return false;
    const last = Math.max(f.mtime, f.atime);
    if (age === '6m' && Date.now() - last < 180 * DAY) return false;
    if (age === '1y' && Date.now() - last < 365 * DAY) return false;
    return !q || f.name.toLowerCase().includes(q.toLowerCase());
  }), [files, kind, age, q]);

  const selFiles = useMemo(() => files.filter((f) => sel.has(f.path)), [files, sel]);
  const selSize = selFiles.reduce((a, f) => a + f.size, 0);
  const kinds = useMemo(() => {
    const n = new Map<FileKind, number>();
    for (const f of files) n.set(f.kind, (n.get(f.kind) || 0) + 1);
    return (Object.keys(KIND_META) as FileKind[]).filter((k) => n.has(k)).map((k) => ({ k, n: n.get(k)! }));
  }, [files]);
  const total = useMemo(() => files.reduce((a, f) => a + f.size, 0), [files]);

  const remove = async () => {
    setConfirm(false);
    const r = await api.trash([...sel]);
    setFreed(r.freed || selSize);
    recordFreed(r.freed || selSize);
    setFiles((fs) => fs.filter((f) => !sel.has(f.path)));
    setSel(new Set());
    setPhase('done');
    setBadge('large', null);
    refreshSys();
    if (r.failed) toast(`${r.failed} 個のファイルを移動できませんでした`, 'err');
  };

  if (phase === 'idle') {
    return (
      <>
        <IdleHero icon={FileStack} title="大容量・古いファイル" tagline={HELP.large.tagline} onActivate={scan} />
        <ScanDock onClick={scan} hint={
          <span style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <Segmented value={minMb} onChange={setMinMb} options={[{ value: '50', label: '50 MB 以上' }, { value: '100', label: '100 MB 以上' }, { value: '500', label: '500 MB 以上' }, { value: '1024', label: '1 GB 以上' }]} />
            <ScanLocations value={roots} onChange={setRoots} />
          </span>
        } />
      </>
    );
  }

  if (phase === 'scanning') {
    return (
      <>
        <ScanningHero icon={FileStack} title="大きなファイルを検索中" path={prog.current}>
          <div className="big">{formatNumber(prog.found)}<small>個</small></div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{formatNumber(prog.scanned)} 個を確認</div>
        </ScanningHero>
        <ScanDock label="停止" ghost onClick={() => api.cancel('large')} />
      </>
    );
  }

  if (phase === 'done') {
    return <DoneHero freed={freed} title="をごみ箱へ移動" doneLabel="戻る" onDone={() => setPhase('results')} />;
  }

  return (
    <>
      <PageHead icon={FileStack} title="大容量・古いファイル" sub={`${formatNumber(files.length)} 個 ・ 合計 ${formatBytes(total)}`}>
        <div className="search"><Search size={15} /><input placeholder="ファイル名で検索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn ghost" onClick={() => setPhase('idle')}>新しいスキャン</button>
      </PageHead>
      <div className="split">
        <div className="side-list">
          <button className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}><LayoutGrid size={17} />すべて<span className="n">{files.length}</span></button>
          {kinds.map(({ k, n }) => {
            const M = KIND_META[k];
            return <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}><M.icon size={17} />{M.label}<span className="n">{n}</span></button>;
          })}
          <div className="nav-label" style={{ marginTop: 18 }}>最終使用</div>
          {([['all', 'すべての期間'], ['6m', '6 か月以上前'], ['1y', '1 年以上前']] as [Age, string][]).map(([k, l]) => (
            <button key={k} className={age === k ? 'on' : ''} onClick={() => setAge(k)}><CalendarClock size={17} />{l}</button>
          ))}
        </div>
        <div className="list-col">
          <ListHead cols={[{ w: 20 }, { w: 38 }, { label: 'ファイル', grow: true }, { label: '最終使用', w: 90, align: 'right' }, { label: 'サイズ', w: 84, align: 'right' }, { w: 32 }]} />
          <VirtualList items={shown} rowHeight={ROW} empty={<div className="empty" style={{ minHeight: 220 }}>条件に一致するファイルはありません</div>} render={(f) => {
            const M = KIND_META[f.kind];
            const on = sel.has(f.path);
            return (
              <label key={f.path} className={`row ${on ? 'sel' : ''}`} style={{ cursor: 'pointer', height: ROW }}>
                <Checkbox checked={on} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(f.path) : n.delete(f.path); return n; })} />
                <div className="kind-icon" style={{ '--k': M.color } as CSSProperties}><M.icon size={18} /></div>
                <div className="grow">
                  <div className="t">{f.name}</div>
                  <div className="sub mono">{prettyPath(dirname(f.path))}</div>
                </div>
                <div className="meta" title="最終更新">{timeAgo(Math.max(f.mtime, f.atime))}</div>
                <div className="num">{formatBytes(f.size)}</div>
                <button className="icon-btn row-action" aria-label="場所を表示" onClick={(e) => { e.preventDefault(); api.reveal(f.path); }}><FolderOpen size={15} /></button>
              </label>
            );
          }} />
        </div>
      </div>
      <div className="footer-bar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <Checkbox checked={shown.length > 0 && shown.every((f) => sel.has(f.path))} indeterminate={sel.size > 0}
            onChange={(v) => setSel((s) => { const n = new Set(s); shown.forEach((f) => (v ? n.add(f.path) : n.delete(f.path))); return n; })} />
          <span className="muted">すべて選択</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div className="sum"><span>{sel.size} 個</span><b>{formatBytes(selSize)}</b></div>
          <ActionButton disabled={!sel.size} onClick={() => setConfirm(true)}>ごみ箱へ移動</ActionButton>
        </div>
      </div>
      {confirm && (
        <Modal title={`${sel.size} 個のファイルをごみ箱へ移動しますか？`} onClose={() => setConfirm(false)} actions={<>
          <button className="btn ghost" onClick={() => setConfirm(false)}>キャンセル</button>
          <button className="btn primary" onClick={remove}>移動する</button>
        </>}>
          <p>{formatBytes(selSize)} ・ ごみ箱から元に戻せます</p>
          <div className="modal-list" style={{ maxHeight: 220 }}>
            {selFiles.slice(0, 50).map((f) => <div key={f.path} className="sub ellipsis" style={{ fontSize: 12.5 }}>{f.name} <span className="faint">— {formatBytes(f.size)}</span></div>)}
          </div>
        </Modal>
      )}
    </>
  );
}
