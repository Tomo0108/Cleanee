import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChartPie, HardDrive, Usb, ChevronRight, FolderOpen, Folder, File, MoreHorizontal, FolderPlus, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import type { SpaceNode } from '../api/types';
import { useApp } from '../App';
import { formatBytes, formatNumber } from '../lib/format';
import { ScanningHero, ScanDock, PageHead, Checkbox, Modal, useProgress, useToast, ActionButton } from '../components/ui';
import { Ring } from './Optimize';
import { HELP } from '../help';

/** Apple system palette, ordered so neighbouring tiles stay distinguishable. */
const PALETTE = ['#5e5ce6', '#0a84ff', '#30b0c7', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ac8e68', '#ff6961'];

interface Rect { x: number; y: number; w: number; h: number }
interface Placed<T> extends Rect { item: T }

/** Squarified treemap layout (Bruls et al.). */
function squarify<T extends { size: number }>(items: T[], rect: Rect): Placed<T>[] {
  const total = items.reduce((a, i) => a + i.size, 0);
  if (!total || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const nodes = items.filter((i) => i.size > 0).map((item) => ({ item, area: item.size * scale }));
  const out: Placed<T>[] = [];
  let { x, y, w, h } = rect;
  let row: typeof nodes = [];
  const worst = (r: typeof nodes, side: number) => {
    const s = r.reduce((a, n) => a + n.area, 0);
    const max = Math.max(...r.map((n) => n.area));
    const min = Math.min(...r.map((n) => n.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const layoutRow = (r: typeof nodes) => {
    const s = r.reduce((a, n) => a + n.area, 0);
    if (w >= h) {
      const rw = s / h;
      let cy = y;
      for (const n of r) { const nh = n.area / rw; out.push({ item: n.item, x, y: cy, w: rw, h: nh }); cy += nh; }
      x += rw; w -= rw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const n of r) { const nw = n.area / rh; out.push({ item: n.item, x: cx, y, w: nw, h: rh }); cx += nw; }
      y += rh; h -= rh;
    }
  };
  for (const n of nodes) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else { layoutRow(row); row = [n]; }
  }
  if (row.length) layoutRow(row);
  return out;
}

export default function SpaceLens() {
  const { sys, setBadge, refreshSys, recordFreed } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<'pick' | 'scanning' | 'view'>('pick');
  const [prog, setProg] = useState<{ current?: string; bytes: number; files: number }>({ bytes: 0, files: 0 });
  const [stack, setStack] = useState<SpaceNode[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

  useProgress<typeof prog>('space', setProg);

  const scan = async (root: string) => {
    setPhase('scanning');
    setBadge('space', { busy: true });
    setProg({ bytes: 0, files: 0 });
    const n = await api.spaceScan(root);
    setStack([n]);
    setSel(new Set());
    setPhase('view');
    setBadge('space', null);
  };

  const node = stack[stack.length - 1];
  const open = async (child: SpaceNode) => {
    if (child.type !== 'dir' || !child.hasChildren) return;
    const full = await api.spaceNode(child.path);
    if (full) setStack((s) => [...s, full]);
  };

  const children = node?.children || [];
  const selItems = children.filter((c) => sel.has(c.path));
  const selSize = selItems.reduce((a, c) => a + c.size, 0);

  const remove = async () => {
    setConfirm(false);
    const paths = [...sel];
    const r = await api.trash(paths);
    recordFreed(r.failed ? r.freed : selSize);
    toast(`${formatBytes(selSize)} をごみ箱に移動しました${r.failed ? `（${r.failed} 件失敗）` : ''}`, r.failed ? 'info' : 'ok');
    // Refresh every level of the breadcrumb so sizes stay consistent.
    const refreshed = await Promise.all(stack.map((s) => api.spaceNode(s.path)));
    setStack(refreshed.map((n, i) => n || stack[i]));
    setSel(new Set());
    refreshSys();
  };

  if (phase === 'pick') {
    return (
      <>
        <div className="hero centered" style={{ alignContent: 'center' }}>
          <div style={{ animation: 'rise .5s both' }}>
            <h1 style={{ marginBottom: 6 }}>スペースレンズ</h1>
            <p className="tagline">{HELP.space.tagline}</p>
          </div>
          <div className="drive-cards">
            {(sys?.drives || []).map((d, i) => (
              <button key={d.mount} className="drive-card" style={{ animation: `rise .5s ${0.1 + i * 0.07}s both` }} onClick={() => scan(d.mount)}>
                <div className="top">
                  <Ring ratio={(d.total - d.free) / d.total} label={`${Math.round(((d.total - d.free) / d.total) * 100)}%`} size={56} color={(d.total - d.free) / d.total > 0.9 ? 'var(--danger)' : undefined} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>{d.external ? <Usb size={16} /> : <HardDrive size={16} />}{d.label} ({d.mount.replace('\\', '')}){d.external && <span className="loc-tag">外付け</span>}{d.system && <span className="loc-tag">システム</span>}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{formatBytes(d.free)} 空き / {formatBytes(d.total, 0)}</div>
                  </div>
                </div>
                <div className="chip accent">スキャン <ChevronRight size={12} /></div>
              </button>
            ))}
            <button className="drive-card" style={{ animation: 'rise .5s .3s both' }} onClick={async () => { const p = await api.pickFolders(); if (p[0]) scan(p[0]); }}>
              <div className="top">
                <div className="kind-icon neutral" style={{ width: 56, height: 56, borderRadius: 16 }}><FolderPlus size={24} /></div>
                <div><div style={{ fontWeight: 700, fontSize: 16 }}>フォルダを選択</div></div>
              </div>
            </button>
          </div>
        </div>
      </>
    );
  }

  if (phase === 'scanning') {
    return (
      <>
        <ScanningHero icon={ChartPie} title="サイズマップを作成しています…" bytes={prog.bytes} path={prog.current}>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{formatNumber(prog.files)} 個のファイル</div>
        </ScanningHero>
        <ScanDock label="停止" ghost onClick={() => api.cancel('space')} />
      </>
    );
  }

  return (
    <>
      <PageHead icon={ChartPie} title="スペースレンズ" sub={`${node.name} ・ ${formatBytes(node.size)} ・ ${formatNumber(node.count)} 個のファイル`}>
        <button className="btn ghost" onClick={() => setPhase('pick')}>別の場所を分析</button>
      </PageHead>
      <div className="crumbs">
        {stack.length > 1 && <button onClick={() => { setStack((s) => s.slice(0, -1)); setSel(new Set()); }} title="戻る"><ArrowLeft size={14} /></button>}
        {stack.map((s, i) => (
          <span key={s.path} style={{ display: 'contents' }}>
            {i > 0 && <ChevronRight size={14} className="faint" />}
            <button onClick={() => { setStack((st) => st.slice(0, i + 1)); setSel(new Set()); }}>{s.name}</button>
          </span>
        ))}
      </div>
      <div className="lens">
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Treemap node={node} sel={sel} onOpen={open} onSelect={(p) => setSel((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; })} />
        </div>
        <div className="lens-side">
          <div className="glass-scroll">
            <div className="rows">
              {children.map((c, i) => {
                const k = PALETTE[i % PALETTE.length];
                const Icon = c.type === 'dir' ? Folder : c.type === 'file' ? File : MoreHorizontal;
                return (
                  <div key={c.path} className={`row ${sel.has(c.path) ? 'sel' : ''}`} style={{ padding: '8px 10px', gap: 10, cursor: c.hasChildren ? 'pointer' : 'default' }} onDoubleClick={() => open(c)}>
                    <Checkbox checked={sel.has(c.path)} disabled={c.type === 'other'} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(c.path) : n.delete(c.path); return n; })} />
                    <div className="kind-icon" style={{ width: 30, height: 30, borderRadius: 8, '--k': c.type === 'other' ? '#8e8e93' : k } as CSSProperties}><Icon size={15} /></div>
                    <div className="grow" onClick={() => open(c)}>
                      <div className="t" style={{ fontSize: 13 }}>{c.name}</div>
                      <div className="meter" style={{ marginTop: 5, '--m1': c.type === 'other' ? '#8e8e93' : k } as CSSProperties}><i style={{ width: `${Math.max(1, (c.size / node.size) * 100)}%` }} /></div>
                    </div>
                    <div className="num" style={{ minWidth: 64, fontSize: 12.5 }}>{formatBytes(c.size)}</div>
                    {c.type !== 'other' && <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => api.reveal(c.path)}><FolderOpen size={14} /></button>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="footer-bar">
            <div className="sum"><b style={{ fontSize: 18 }}>{formatBytes(selSize)}</b><span>{sel.size} 項目</span></div>
            <ActionButton disabled={!sel.size} onClick={() => setConfirm(true)}>ごみ箱へ</ActionButton>
          </div>
        </div>
      </div>
      {confirm && (
        <Modal title={`${sel.size} 項目をごみ箱へ移動しますか？`} onClose={() => setConfirm(false)} actions={<>
          <button className="btn ghost" onClick={() => setConfirm(false)}>キャンセル</button>
          <button className="btn danger" onClick={remove}>移動する</button>
        </>}>
          <p>{formatBytes(selSize)} ・ システムフォルダの削除はアプリの不具合の原因になります</p>
          <div className="modal-list" style={{ maxHeight: 200 }}>
            {selItems.map((c) => <div key={c.path} className="sub mono ellipsis" style={{ fontSize: 12 }}>{c.path}</div>)}
          </div>
        </Modal>
      )}
    </>
  );
}

function Treemap({ node, sel, onOpen, onSelect }: { node: SpaceNode; sel: Set<string>; onOpen: (n: SpaceNode) => void; onSelect: (p: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<{ x: number; y: number; n: SpaceNode } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setTip(null), [node]);

  const GAP = 3;
  const placed = useMemo(() => squarify(node.children || [], { x: 0, y: 0, w: box.w, h: box.h }), [node, box]);

  return (
    <div className="treemap" ref={ref} onMouseLeave={() => setTip(null)}>
      {placed.map((p, i) => {
        const k = p.item.type === 'other' ? '#8e8e93' : PALETTE[i % PALETTE.length];
        const w = p.w - GAP * 2, h = p.h - GAP * 2;
        const inner = p.item.children && w > 80 && h > 70 ? squarify(p.item.children, { x: 6, y: 42, w: w - 12, h: h - 48 }) : [];
        return (
          <div
            key={p.item.path}
            className={`tm-node ${sel.has(p.item.path) ? 'sel' : ''}`}
            style={{ left: p.x + GAP, top: p.y + GAP, width: Math.max(0, w), height: Math.max(0, h), '--k': k, animationDelay: `${Math.min(i, 20) * 14}ms` } as CSSProperties}
            onClick={(e) => (e.ctrlKey || e.metaKey ? onSelect(p.item.path) : onOpen(p.item))}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, n: p.item })}
          >
            {inner.map((c) => <div key={c.item.path} className="tm-child" style={{ left: c.x + 1, top: c.y + 1, width: Math.max(0, c.w - 2), height: Math.max(0, c.h - 2) }} />)}
            {w > 60 && h > 32 && <div className="lbl">{p.item.name}<small>{formatBytes(p.item.size)}</small></div>}
          </div>
        );
      })}
      {tip && (
        <div className="tm-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 380), top: tip.y + 16 }}>
          <b>{tip.n.name}</b> ・ {formatBytes(tip.n.size)}
          {tip.n.type === 'dir' && <span className="faint"> ・ {formatNumber(tip.n.count)} 個のファイル</span>}
          {tip.n.type !== 'other' && <div className="p">{tip.n.path}</div>}
          <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{tip.n.hasChildren ? 'クリックで開く ・ ' : ''}Ctrl+クリックで選択</div>
        </div>
      )}
    </div>
  );
}
