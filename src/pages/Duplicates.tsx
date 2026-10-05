import { useMemo, useState, type CSSProperties } from 'react';
import { Copy, Wand2, FolderPlus, FolderOpen, LayoutGrid, X, ShieldCheck } from 'lucide-react';
import { HELP } from '../help';
import { api } from '../api';
import type { DupGroup, FileKind } from '../api/types';
import { useApp } from '../App';
import { formatBytes, formatNumber, formatDate, prettyPath, dirname } from '../lib/format';
import { KIND_META } from '../lib/icons';
import { IdleHero, ScanningHero, ScanDock, PageHead, Checkbox, Modal, useProgress, useToast } from '../components/ui';
import { DoneHero } from '../components/Results';

type Phase = 'idle' | 'scanning' | 'results' | 'done';
type Prog = { stage: 'collect' | 'hash'; current?: string; scanned?: number; hashed?: number; total?: number };

/** Default selection: keep the oldest copy (likely the original), select the rest. */
const autoSelect = (groups: DupGroup[]) => new Set(groups.flatMap((g) => g.files.slice(1).map((f) => f.path)));

export default function Duplicates() {
  const { setBadge, refreshSys, recordFreed } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [roots, setRoots] = useState<string[]>([]);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [prog, setProg] = useState<Prog>({ stage: 'collect' });
  const [kind, setKind] = useState<FileKind | 'all'>('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [freed, setFreed] = useState(0);

  useProgress<Prog>('dup', setProg);

  const scan = async () => {
    setPhase('scanning');
    setBadge('duplicates', { busy: true });
    setProg({ stage: 'collect' });
    const g = await api.dupScan({ roots });
    setGroups(g);
    setSel(autoSelect(g));
    setPhase('results');
    setBadge('duplicates', g.length ? { text: String(g.length) } : null);
  };

  const wasted = groups.reduce((a, g) => a + g.size * (g.files.length - 1), 0);
  const shown = useMemo(() => groups.filter((g) => kind === 'all' || g.kind === kind), [groups, kind]);
  const selSize = groups.flatMap((g) => g.files).filter((f) => sel.has(f.path)).reduce((a, f) => a + f.size, 0);
  const kinds = (Object.keys(KIND_META) as FileKind[]).map((k) => ({ k, n: groups.filter((g) => g.kind === k).length })).filter((x) => x.n);

  const toggle = (g: DupGroup, path: string, v: boolean) => {
    if (v && g.files.every((f) => f.path === path || sel.has(f.path))) {
      toast('少なくとも 1 つのファイルは残す必要があります', 'info');
      return;
    }
    setSel((s) => { const n = new Set(s); v ? n.add(path) : n.delete(path); return n; });
  };

  const remove = async () => {
    setConfirm(false);
    const r = await api.trash([...sel]);
    setFreed(r.freed || selSize);
    recordFreed(r.freed || selSize);
    setGroups((gs) => gs.map((g) => ({ ...g, files: g.files.filter((f) => !sel.has(f.path)) })).filter((g) => g.files.length > 1));
    setSel(new Set());
    setPhase('done');
    setBadge('duplicates', null);
    refreshSys();
    if (r.failed) toast(`${r.failed} 個のファイルを移動できませんでした`, 'err');
  };

  if (phase === 'idle') {
    return (
      <>
        <IdleHero icon={Copy} title="重複ファイル" tagline={HELP.duplicates.tagline} onActivate={scan} />
        <ScanDock onClick={scan} hint={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {roots.map((r) => <span key={r} className="chip">{prettyPath(r)}<X size={12} style={{ cursor: 'pointer' }} onClick={() => setRoots((x) => x.filter((y) => y !== r))} /></span>)}
            <button className="btn sm ghost" onClick={async () => { const p = await api.pickFolders(); if (p.length) setRoots((r) => [...new Set([...r, ...p])]); }}>
              <FolderPlus size={14} />{roots.length ? '追加' : 'ユーザーフォルダ'}
            </button>
          </span>
        } />
      </>
    );
  }

  if (phase === 'scanning') {
    const p = prog.stage === 'hash' && prog.total ? (prog.hashed || 0) / prog.total : undefined;
    return (
      <>
        <ScanningHero icon={Copy} title={prog.stage === 'collect' ? 'ファイルを収集中' : '内容を比較中'} path={prog.current} progress={p}>
          <div className="big">{prog.stage === 'collect' ? formatNumber(prog.scanned || 0) : `${Math.round((p || 0) * 100)}`}<small>{prog.stage === 'collect' ? '個のファイル' : '%'}</small></div>
        </ScanningHero>
        <ScanDock label="停止" ghost onClick={() => api.cancel('dup')} />
      </>
    );
  }

  if (phase === 'done') {
    return <DoneHero freed={freed} title="をごみ箱へ移動" doneLabel="戻る" onDone={() => setPhase(groups.length ? 'results' : 'idle')} />;
  }

  return (
    <>
      <PageHead icon={Copy} title="重複ファイル" sub={`${groups.length} 組 ・ ${formatBytes(wasted)} 削減可能`}>
        <button className="btn" onClick={() => setSel(autoSelect(groups))}><Wand2 size={15} />自動選択</button>
        <button className="btn ghost" onClick={() => setSel(new Set())}>選択解除</button>
        <button className="btn ghost" onClick={() => setPhase('idle')}>新しいスキャン</button>
      </PageHead>
      {!groups.length ? (
        <div className="empty"><div><ShieldCheck size={44} /><h3>重複ファイルは見つかりませんでした</h3></div></div>
      ) : (
        <div className="split">
          <div className="side-list">
            <button className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}><LayoutGrid size={17} />すべて<span className="n">{groups.length}</span></button>
            {kinds.map(({ k, n }) => { const M = KIND_META[k]; return <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}><M.icon size={17} />{M.label}<span className="n">{n}</span></button>; })}
          </div>
          <div className="glass-scroll">
            <div style={{ display: 'grid', gap: 12, paddingBottom: 6 }}>
              {shown.map((g, gi) => {
                const M = KIND_META[g.kind];
                return (
                  <div key={g.id} className="card" style={{ padding: 6, animation: `rise .4s ${Math.min(gi, 10) * 35}ms both` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px' }}>
                      <div className="kind-icon" style={{ '--k': M.color } as CSSProperties}><M.icon size={18} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ellipsis" style={{ fontWeight: 600 }}>{g.name}</div>
                        <div className="faint" style={{ fontSize: 12 }}>{g.files.length} 個のコピー ・ 各 {formatBytes(g.size)}</div>
                      </div>
                      <span className="chip accent">{formatBytes(g.size * (g.files.length - 1))} 削減可能</span>
                    </div>
                    {g.files.map((f, i) => (
                      <label key={f.path} className={`row ${sel.has(f.path) ? 'sel' : ''}`} style={{ cursor: 'pointer', background: 'transparent', padding: '7px 12px' }}>
                        <Checkbox checked={sel.has(f.path)} onChange={(v) => toggle(g, f.path, v)} />
                        <div className="grow"><div className="sub mono" style={{ color: 'var(--text)' }}>{prettyPath(dirname(f.path))}</div></div>
                        {i === 0 && <span className="chip ok">最も古い</span>}
                        <div className="meta">{formatDate(f.mtime)}</div>
                        <button className="icon-btn row-action" aria-label="場所を表示" onClick={(e) => { e.preventDefault(); api.reveal(f.path); }}><FolderOpen size={15} /></button>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="footer-bar">
        <span className="muted">{sel.size} 個</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div className="sum"><b>{formatBytes(selSize)}</b></div>
          <button className="btn primary pill big" disabled={!sel.size} onClick={() => setConfirm(true)}>ごみ箱へ移動</button>
        </div>
      </div>
      {confirm && (
        <Modal title={`${sel.size} 個の重複ファイルをごみ箱へ移動しますか？`} onClose={() => setConfirm(false)} actions={<>
          <button className="btn ghost" onClick={() => setConfirm(false)}>キャンセル</button>
          <button className="btn primary" onClick={remove}>移動する</button>
        </>}>
          <p>{formatBytes(selSize)} ・ 各グループで 1 つは必ず残ります</p>
        </Modal>
      )}
    </>
  );
}
