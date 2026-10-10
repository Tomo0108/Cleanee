import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertTriangle, Info, X, AppWindow, Loader2, type LucideIcon } from 'lucide-react';
import { api } from '../api';
import { MODULES } from '../modules';
import { bytesParts } from '../lib/format';

/* ---------------- Medallion (hero artwork) ---------------- */

/**
 * A frosted-glass disc carrying the module symbol. While scanning, a hairline ring
 * around it shows progress (or a slow indeterminate sweep).
 */
export function Orb({ icon: Icon, scanning, progress, small }: { icon: LucideIcon; scanning?: boolean; progress?: number; small?: boolean }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  return (
    <div className={`medal ${scanning ? 'scanning' : ''} ${small ? 'sm' : ''}`}>
      {scanning && (
        <svg className={`medal-ring ${progress === undefined ? 'sweep' : ''}`} viewBox="0 0 100 100" aria-hidden>
          <circle className="track" cx="50" cy="50" r={r} />
          <circle
            className="value" cx="50" cy="50" r={r}
            strokeDasharray={progress === undefined ? `${c * 0.22} ${c}` : c}
            strokeDashoffset={progress === undefined ? 0 : c * (1 - Math.min(1, progress))}
          />
        </svg>
      )}
      <div className="medal-glass">
        <span className="medal-sheen" />
        <Icon className="medal-icon" strokeWidth={1.5} />
      </div>
    </div>
  );
}

/* ---------------- Hero layouts ---------------- */

export function IdleHero({ icon, title, tagline, extra, onActivate, actionLabel = 'スキャン' }: {
  icon: LucideIcon; title: string; tagline?: string; extra?: ReactNode; onActivate?: () => void; actionLabel?: string;
}) {
  return (
    <div className="idle">
      {onActivate ? (
        <button className="medal-btn" onClick={onActivate} aria-label={`${title}を${actionLabel}`} title={`クリックして${actionLabel}`}>
          <Orb icon={icon} />
        </button>
      ) : <Orb icon={icon} />}
      <h1>{title}</h1>
      {tagline && <p className="tagline">{tagline}</p>}
      {extra && <div className="idle-extra">{extra}</div>}
    </div>
  );
}

export function ScanningHero({ icon, title, bytes, path, progress, children }: { icon: LucideIcon; title: string; bytes?: number; path?: string; progress?: number; children?: ReactNode }) {
  return (
    <div className="hero centered">
      <div className="hero-art" style={{ minHeight: 0 }}><Orb icon={icon} scanning progress={progress} /></div>
      <div className="scan-status">
        <div className="scan-title">{title}</div>
        {bytes !== undefined && <BigBytes bytes={bytes} />}
        {children}
        <div className="scan-path">{path ? `‎${path}` : ' '}</div>
      </div>
    </div>
  );
}

export function BigBytes({ bytes, suffix }: { bytes: number; suffix?: string }) {
  const v = useAnimatedNumber(bytes);
  const [n, u] = bytesParts(v);
  return <div className="big">{n}<small>{u}{suffix}</small></div>;
}

/**
 * The single page-level action button (スキャン, 実行, クリーンアップ, ごみ箱へ移動, 停止 …):
 * one size, look and motion everywhere. `busy` swaps in a spinner and blocks clicks.
 */
export function ActionButton({ children, onClick, ghost, danger, disabled, busy, busyLabel }: {
  children: ReactNode; onClick: () => void; ghost?: boolean; danger?: boolean; disabled?: boolean; busy?: boolean; busyLabel?: ReactNode;
}) {
  return (
    <button className={`action-btn ${ghost ? 'ghost' : ''} ${danger ? 'danger' : ''}`} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <><Loader2 className="spin" />{busyLabel ?? children}</> : children}
    </button>
  );
}

export function ScanDock({ label = 'スキャン', onClick, hint, ghost, disabled }: { label?: string; onClick: () => void; hint?: ReactNode; ghost?: boolean; disabled?: boolean }) {
  return (
    <div className="scan-dock">
      <ActionButton ghost={ghost} disabled={disabled} onClick={onClick}>{label}</ActionButton>
      <div className="scan-hint">{hint}</div>
    </div>
  );
}

export function PageHead({ icon: Icon, title, sub, children }: { icon: LucideIcon; title: string; sub?: ReactNode; children?: ReactNode }) {
  const group = MODULES.find((m) => m.title === title)?.group;
  return (
    <div className="page-head">
      <div className="page-head-main">
        <span className="head-icon"><Icon size={20} /></span>
        <div>
          {group && <div className="head-group">{group}</div>}
          <h2>{title}</h2>
        </div>
        {sub && <span className="head-sub">{sub}</span>}
      </div>
      <div className="head-actions">{children}</div>
    </div>
  );
}

/** Column header row matching the flex layout of `.row` lists. */
export interface Col { label?: string; w?: number; grow?: boolean; align?: 'left' | 'right' | 'center' }
export function ListHead({ cols }: { cols: Col[] }) {
  return (
    <div className="list-head">
      {cols.map((c, i) => (
        <span key={i} style={{ width: c.w, flex: c.grow ? 1 : 'none', minWidth: c.grow ? 0 : undefined, textAlign: c.align || 'left' }}>{c.label}</span>
      ))}
    </div>
  );
}

/**
 * Scrolling list that only mounts the rows in view (plus a small margin), so result lists with
 * tens of thousands of entries stay as light as a short one. Rows must share one fixed height.
 */
export function VirtualList<T>({ items, rowHeight, render, overscan = 6, className = '', empty, scrollTo, onKeyDown, label }: {
  items: T[]; rowHeight: number; render: (item: T, index: number) => ReactNode; overscan?: number; className?: string;
  empty?: ReactNode; scrollTo?: number; onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void; label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 800 });
  const frame = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(frame.current); };
  }, []);

  // Keep a keyboard-selected row in view.
  useEffect(() => {
    const el = ref.current;
    if (!el || scrollTo === undefined || scrollTo < 0) return;
    const y = scrollTo * rowHeight;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = y + rowHeight - el.clientHeight;
  }, [scrollTo, rowHeight]);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (el) setView({ top: el.scrollTop, height: el.clientHeight });
    });
  };

  const start = Math.max(0, Math.floor(view.top / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((view.top + view.height) / rowHeight) + overscan);
  const rows = [];
  for (let i = start; i < end; i++) rows.push(render(items[i], i));

  return (
    <div ref={ref} className={`glass-scroll vlist ${className}`} onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={onKeyDown ? 0 : undefined} aria-label={label}>
      {!items.length ? empty : (
        <div className="vlist-body" style={{ height: items.length * rowHeight + 8 }}>
          <div className="vlist-rows" style={{ transform: `translateY(${start * rowHeight}px)` }}>{rows}</div>
        </div>
      )}
    </div>
  );
}

/** Native app icon, or a generic application glyph while it loads / when none exists. */
export function AppIcon({ src }: { src: string | null }) {
  return (
    <div className={`app-icon ${src ? '' : 'generic'}`}>
      {src ? <img src={src} alt="" draggable={false} /> : <AppWindow size={18} strokeWidth={1.7} />}
    </div>
  );
}

/* ---------------- Hover card ---------------- */

/**
 * Shows `content` in a glass popover after the pointer rests on `children`.
 * The card can be hovered (to copy text or press its buttons) and flips above
 * the anchor when there is no room below.
 */
export function HoverCard({ children, content, width = 340 }: { children: ReactNode; content: ReactNode; width?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const open = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const above = r.bottom + 260 > window.innerHeight;
      setPos({ x: Math.max(12, Math.min(r.left - 12, window.innerWidth - width - 16)), y: above ? r.top - 8 : r.bottom + 8, above });
    }, 380);
  };
  const close = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setPos(null), 120); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span ref={ref} className="hc-anchor" onMouseEnter={open} onMouseLeave={close}>
      {children}
      {pos && createPortal(
        <div className={`hovercard ${pos.above ? 'above' : ''}`} style={{ left: pos.x, top: pos.y, width }} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={close}>
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** Standard layout for a hover card: header + label/value rows + optional actions. */
export function DetailCard({ icon, title, sub, rows, actions }: {
  icon?: ReactNode; title: string; sub?: string; rows: [string, ReactNode | undefined | null][]; actions?: ReactNode;
}) {
  return (
    <>
      <div className="dc-head">
        {icon}
        <div style={{ minWidth: 0 }}>
          <div className="dc-title">{title}</div>
          {sub && <div className="dc-sub">{sub}</div>}
        </div>
      </div>
      <dl className="dc-rows">
        {rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {actions && <div className="dc-actions">{actions}</div>}
    </>
  );
}

/* ---------------- Inputs ---------------- */

export function Checkbox({ checked, indeterminate, onChange, disabled, title }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked; }, [indeterminate, checked]);
  return (
    <input
      ref={ref} type="checkbox" className="check" checked={checked} disabled={disabled} title={title}
      onClick={(e) => e.stopPropagation()} onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export function Toggle({ on, onChange, disabled, title }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} title={title} disabled={disabled} onClick={() => onChange(!on)} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({ title, children, onClose, actions, wide, className = '' }: { title?: string; children: ReactNode; onClose: () => void; actions: ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  // Portal to the app root so the dialog sits above the sidebar instead of inside the page's
  // stacking context; `.app` (not body) so the module accent variables still apply.
  return createPortal(
    <div className="modal-back" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {children}
        <div className="actions">{actions}</div>
      </div>
    </div>,
    document.querySelector('.app') || document.body,
  );
}

/* ---------------- Toasts ---------------- */

type ToastKind = 'ok' | 'err' | 'info';
interface ToastItem { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="ti">{t.kind === 'ok' ? <Check size={16} /> : t.kind === 'err' ? <AlertTriangle size={15} /> : <Info size={15} />}</span>
            <span style={{ flex: 1 }}>{t.text}</span>
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Hooks ---------------- */

/** Smoothly animates a number towards its target value. */
export function useAnimatedNumber(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const valueRef = useRef(target);
  useEffect(() => {
    fromRef.current = valueRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = fromRef.current + (target - fromRef.current) * e;
      valueRef.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function useProgress<T>(task: string, cb: (d: T) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => api.onProgress<T>(task, (d) => ref.current(d)), [task]);
}

/** Lazily loads a native file/app icon and caches it for the session. */
const iconCache = new Map<string, Promise<string | null>>();
export function useNativeIcon(key: string | null, loader: () => Promise<string | null>) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    if (!iconCache.has(key)) iconCache.set(key, loader().catch(() => null));
    iconCache.get(key)!.then((s) => alive && setSrc(s));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return src;
}

/** Deterministic pleasant gradient for an arbitrary string (used for app avatars). */
export function gradientFor(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 75% 58%), hsl(${(hue + 40) % 360} 80% 48%))`;
}
