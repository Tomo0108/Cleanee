import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Copy, Wand2, FolderOpen, LayoutGrid, ShieldCheck, Search, RotateCcw, X } from 'lucide-react';
import { HELP } from '../help';
import { api } from '../api';
import type { DupFile, DupGroup, FileKind } from '../api/types';
import { useApp } from '../App';
import { formatBytes, formatNumber, formatDate, timeAgo, prettyPath, dirname } from '../lib/format';
import { KIND_META } from '../lib/icons';
import { IdleHero, ScanningHero, ScanDock, PageHead, Checkbox, Modal, Segmented, VirtualList, useNativeIcon, useProgress, useToast, ActionButton } from '../components/ui';
import { DoneHero } from '../components/Results';
import { ScanLocations } from '../components/ScanLocations';

type Phase = 'idle' | 'scanning' | 'results' | 'done';
type Prog = {
  stage: 'collect' | 'compare' | 'hash'; current?: string; scanned?: number;
  done?: number; total?: number; bytes?: number; totalBytes?: number; found?: number;
};
type Keep = 'oldest' | 'newest';

const GROUP_ROW = 58;
const STAGE_TITLE = { collect: 'ファイルを収集中', compare: '同じサイズのファイルを照合中', hash: '内容を比較中' };

/** Files are sorted oldest first; everything except the copy to keep is selected. */
const extras = (g: DupGroup, keep: Keep) => (keep === 'oldest' ? g.files.slice(1) : g.files.slice(0, -1));
const autoSelect = (groups: DupGroup[], keep: Keep) => new Set(groups.flatMap((g) => extras(g, keep).map((f) => f.path)));
const wasteOf = (g: DupGroup) => g.size * (g.files.length - 1);

export default function Duplicates() {
  const { setBadge, refreshSys, recordFreed } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [roots, setRoots] = useState<string[]>(['~']);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [prog, setProg] = useState<Prog>({ stage: 'collect' });
  const [kind, setKind] = useState<FileKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [keep, setKeep] = useState<Keep>('oldest');
  const [activeId, setActiveId] = useState<string | null>(null);
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
    setSel(autoSelect(g, keep));
    setActiveId(g[0]?.id ?? null);
    setKind('all');
    setQ('');
    setPhase('results');
    setBadge('duplicates', g.length ? { text: String(g.length) } : null);
  };

  const sizeOf = useMemo(() => new Map(groups.flatMap((g) => g.files.map((f) => [f.path, f.size] as const))), [groups]);
  const wasted = useMemo(() => groups.reduce((a, g) => a + wasteOf(g), 0), [groups]);
  const kinds = useMemo(() => {
    const n = new Map<FileKind, number>();
    for (const g of groups) n.set(g.kind, (n.get(g.kind) || 0) + 1);
    return (Object.keys(KIND_META) as FileKind[]).filter((k) => n.has(k)).map((k) => ({ k, n: n.get(k)! }));
  }, [groups]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups.filter((g) => (kind === 'all' || g.kind === kind) && (!needle || g.name.toLowerCase().includes(needle)));
  }, [groups, kind, q]);
  const selSize = useMemo(() => { let s = 0; for (const p of sel) s += sizeOf.get(p) || 0; return s; }, [sel, sizeOf]);

  const activeIdx = Math.max(0, shown.findIndex((g) => g.id === activeId));
  const active = shown[activeIdx] as DupGroup | undefined;

  const toggle = (g: DupGroup, path: string, v: boolean) => {
    if (v && g.files.every((f) => f.path === path || sel.has(f.path))) {
      toast('少なくとも 1 つのファイルは残す必要があります', 'info');
      return;
    }
    setSel((s) => { const n = new Set(s); v ? n.add(path) : n.delete(path); return n; });
  };

  /** Group checkbox: select every copy except the one to keep, or clear the group. */
  const setGroup = (g: DupGroup, on: boolean, rule: Keep = keep) => setSel((s) => {
    const n = new Set(s);
    g.files.forEach((f) => n.delete(f.path));
    if (on) extras(g, rule).forEach((f) => n.add(f.path));
    return n;
  });

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!shown.length) return;
    const move = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (move) {
      e.preventDefault();
      setActiveId(shown[Math.min(shown.length - 1, Math.max(0, activeIdx + move))].id);
    } else if (e.key === ' ' && active) {
      e.preventDefault();
      setGroup(active, !active.files.some((f) => sel.has(f.path)));
    }
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
        <ScanDock onClick={scan} hint={<ScanLocations value={roots} onChange={setRoots} />} />
      </>
    );
  }

  if (phase === 'scanning') {
    const p = prog.stage === 'compare' && prog.total ? (prog.done || 0) / prog.total
      : prog.stage === 'hash' && prog.totalBytes ? (prog.bytes || 0) / prog.totalBytes : undefined;
    return (
      <>
        <ScanningHero icon={Copy} title={STAGE_TITLE[prog.stage] || STAGE_TITLE.collect} path={prog.current} progress={p}>
          {prog.stage === 'collect'
            ? <div className="big">{formatNumber(prog.scanned || 0)}<small>個のファイル</small></div>
            : <div className="big">{Math.round((p || 0) * 100)}<small>%</small></div>}
          {prog.stage === 'compare' && <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{formatNumber(prog.done || 0)} / {formatNumber(prog.total || 0)} 個を照合</div>}
          {prog.stage === 'hash' && <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{formatBytes(prog.bytes || 0)} / {formatBytes(prog.totalBytes || 0)} を確認</div>}
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
      <PageHead icon={Copy} title="重複ファイル" sub={`${formatNumber(groups.length)} 組 ・ ${formatBytes(wasted)} 削減可能`}>
        <div className="dup-actions">
          <Segmented value={keep} onChange={(k) => { setKeep(k); setSel(autoSelect(groups, k)); }} options={[{ value: 'oldest', label: '古いものを残す' }, { value: 'newest', label: '新しいものを残す' }]} />
          <button className="btn" onClick={() => setSel(autoSelect(groups, keep))} title="各グループで 1 つを残して選択"><Wand2 size={15} /><span className="lbl">自動選択</span></button>
          <button className="btn ghost" onClick={() => setSel(new Set())} title="選択解除"><X size={15} /><span className="lbl">選択解除</span></button>
          <button className="btn ghost" onClick={() => setPhase('idle')} title="新しいスキャン"><RotateCcw size={15} /><span className="lbl">新しいスキャン</span></button>
        </div>
      </PageHead>
      {!groups.length ? (
        <div className="empty"><div><ShieldCheck size={44} /><h3>重複ファイルは見つかりませんでした</h3></div></div>
      ) : (
        <div className="dup-wrap">
          <div className="dup">
            <nav className="dup-kinds side-list" aria-label="種類">
              <button className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}><LayoutGrid size={17} />すべて<span className="n">{formatNumber(groups.length)}</span></button>
              {kinds.map(({ k, n }) => { const M = KIND_META[k]; return <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}><M.icon size={17} />{M.label}<span className="n">{formatNumber(n)}</span></button>; })}
            </nav>

            <section className="dup-list">
              <div className="search"><Search size={15} /><input placeholder="ファイル名で絞り込み" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <VirtualList
                items={shown} rowHeight={GROUP_ROW} scrollTo={activeIdx} onKeyDown={onListKey} label="重複グループ"
                empty={<div className="empty" style={{ minHeight: 200 }}>条件に一致するファイルはありません</div>}
                render={(g) => {
                  const M = KIND_META[g.kind];
                  const n = g.files.reduce((a, f) => a + (sel.has(f.path) ? 1 : 0), 0);
                  return (
                    <div key={g.id} className={`row dup-row ${g.id === active?.id ? 'active' : ''}`} style={{ height: GROUP_ROW }} onClick={() => setActiveId(g.id)}>
                      <Checkbox checked={n > 0 && n >= g.files.length - 1} indeterminate={n > 0} onChange={(v) => setGroup(g, v)} title={n ? 'このグループの選択を解除' : '1 つを残して選択'} />
                      <div className="kind-icon" style={{ '--k': M.color } as CSSProperties}><M.icon size={17} /></div>
                      <div className="grow">
                        <div className="t">{g.name}</div>
                        <div className="sub">{g.files.length} 個 ・ 各 {formatBytes(g.size)}</div>
                      </div>
                      <div className="dup-waste">{formatBytes(wasteOf(g))}</div>
                    </div>
                  );
                }}
              />
            </section>

            <section className="dup-detail card">
              {active
                ? <GroupDetail key={active.id} g={active} sel={sel} onToggle={toggle} onKeep={(rule) => setGroup(active, true, rule)} />
                : <div className="empty">グループを選択してください</div>}
            </section>
          </div>
        </div>
      )}
      <div className="footer-bar">
        <span className="muted">{formatNumber(sel.size)} 個を選択</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div className="sum"><b>{formatBytes(selSize)}</b></div>
          <ActionButton disabled={!sel.size} onClick={() => setConfirm(true)}>ごみ箱へ移動</ActionButton>
        </div>
      </div>
      {confirm && (
        <Modal title={`${formatNumber(sel.size)} 個の重複ファイルをごみ箱へ移動しますか？`} onClose={() => setConfirm(false)} actions={<>
          <button className="btn ghost" onClick={() => setConfirm(false)}>キャンセル</button>
          <button className="btn primary" onClick={remove}>移動する</button>
        </>}>
          <p>{formatBytes(selSize)} ・ 各グループで 1 つは必ず残ります</p>
        </Modal>
      )}
    </>
  );
}

function GroupDetail({ g, sel, onToggle, onKeep }: {
  g: DupGroup; sel: Set<string>; onToggle: (g: DupGroup, path: string, v: boolean) => void; onKeep: (rule: Keep) => void;
}) {
  const M = KIND_META[g.kind];
  const icon = useNativeIcon(`file:${g.files[0].path}`, () => api.fileIcon(g.files[0].path));
  const last = g.files.length - 1;
  return (
    <>
      <div className="dup-detail-head">
        {icon
          ? <img className="dup-file-icon" src={icon} alt="" />
          : <div className="kind-icon dup-file-icon" style={{ '--k': M.color } as CSSProperties}><M.icon size={24} /></div>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="ellipsis" title={g.name}>{g.name}</h3>
          <div className="faint">{M.label} ・ 各 {formatBytes(g.size)} ・ {g.files.length} 個のコピー</div>
        </div>
        <span className="chip accent">{formatBytes(wasteOf(g))} 削減可能</span>
      </div>
      <div className="dup-keep">
        <span className="faint">残すファイル</span>
        <button className="btn ghost sm" onClick={() => onKeep('oldest')}>最も古いもの</button>
        <button className="btn ghost sm" onClick={() => onKeep('newest')}>最も新しいもの</button>
      </div>
      <div className="glass-scroll">
        <div className="rows">
          {g.files.map((f: DupFile, i) => {
            const on = sel.has(f.path);
            return (
              <label key={f.path} className={`row dup-copy ${on ? 'sel' : ''}`} style={{ cursor: 'pointer' }}>
                <Checkbox checked={on} onChange={(v) => onToggle(g, f.path, v)} />
                <div className="grow">
                  <div className="dup-path mono" title={f.path}>{prettyPath(dirname(f.path))}</div>
                  <div className="sub">{formatDate(f.mtime)} ・ {timeAgo(f.mtime)}</div>
                </div>
                <div className="dup-tags">
                  {i === 0 && last > 0 && <span className="chip">最も古い</span>}
                  {i === last && last > 0 && <span className="chip">最も新しい</span>}
                  {on ? <span className="chip danger">削除</span> : <span className="chip ok">残す</span>}
                </div>
                <button className="icon-btn row-action" aria-label="場所を表示" onClick={(e) => { e.preventDefault(); api.reveal(f.path); }}><FolderOpen size={15} /></button>
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}
