import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import logo from './assets/logo.png';
import { HardDrive, MemoryStick, Cpu, Settings2 } from 'lucide-react';
import { api } from './api';
import type { DefenderStatus, JunkCategory, Settings, SystemInfo } from './api/types';
import { MODULES, moduleById, tint, inkFor, type ModuleId } from './modules';
import { formatBytes } from './lib/format';
import { ToastProvider } from './components/ui';
import { HelpButton } from './components/Help';
import { Background } from './components/Background';
import { SettingsModal } from './components/SettingsModal';
import SmartScan from './pages/SmartScan';
import SystemJunk from './pages/SystemJunk';
import Privacy from './pages/Privacy';
import Protection from './pages/Protection';
import Optimize from './pages/Optimize';
import Maintenance from './pages/Maintenance';
import Uninstaller from './pages/Uninstaller';
import Updater from './pages/Updater';
import SpaceLens from './pages/SpaceLens';
import LargeFiles from './pages/LargeFiles';
import Duplicates from './pages/Duplicates';

type Badge = { text?: string; busy?: boolean };
interface AppCtx {
  go: (id: ModuleId) => void;
  sys: SystemInfo | null;
  refreshSys: () => void;
  setBadge: (id: ModuleId, b: Badge | null) => void;
  settings: Settings | null;
  theme: 'dark' | 'light';
  updateSettings: (patch: Partial<Settings>) => void;
  /** Adds freed bytes to the lifetime statistics. */
  recordFreed: (bytes: number) => void;
  /** Results shared between Smart Scan and the detail modules, so "詳細を確認" doesn't rescan. */
  shared: SharedResults;
  share: (patch: Partial<SharedResults>) => void;
}
export interface SharedResults {
  junk?: { cats: JunkCategory[]; at: number };
  defender?: { status: DefenderStatus; at: number };
}
const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

const PAGES: Record<ModuleId, () => ReactNode> = {
  smart: () => <SmartScan />,
  junk: () => <SystemJunk />,
  privacy: () => <Privacy />,
  protection: () => <Protection />,
  optimize: () => <Optimize />,
  maintenance: () => <Maintenance />,
  uninstaller: () => <Uninstaller />,
  updater: () => <Updater />,
  space: () => <SpaceLens />,
  large: () => <LargeFiles />,
  duplicates: () => <Duplicates />,
};

export default function App() {
  // Reopen on the page the user last used.
  const [active, setActive] = useState<ModuleId>(() => {
    try { const p = localStorage.getItem('cleanee-last-page') as ModuleId; if (MODULES.some((m) => m.id === p)) return p; } catch { /* storage unavailable */ }
    return 'smart';
  });
  const [visited, setVisited] = useState<Set<ModuleId>>(() => new Set([active]));
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [badges, setBadges] = useState<Partial<Record<ModuleId, Badge>>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [shared, setShared] = useState<SharedResults>({});
  const share = useCallback((patch: Partial<SharedResults>) => setShared((s) => ({ ...s, ...patch })), []);

  // Page transition: the previous page plays an exit animation while the new one enters,
  // sliding in the direction of travel through the sidebar.
  const [leaving, setLeaving] = useState<ModuleId | null>(null);
  const [dir, setDir] = useState<'down' | 'up'>('down');
  const activeRef = useRef(active);
  const leaveTimer = useRef(0);
  const go = useCallback((id: ModuleId) => {
    const from = activeRef.current;
    if (id === from) return;
    const idx = (m: ModuleId) => MODULES.findIndex((x) => x.id === m);
    setDir(idx(id) > idx(from) ? 'down' : 'up');
    setLeaving(from);
    clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setLeaving(null), 260);
    try { localStorage.setItem('cleanee-last-page', id); } catch { /* storage unavailable */ }
    activeRef.current = id;
    setActive(id);
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
  }, []);
  const refreshSys = useCallback(() => { api.systemInfo().then(setSys).catch(() => {}); }, []);
  const setBadge = useCallback((id: ModuleId, b: Badge | null) => setBadges((x) => ({ ...x, [id]: b || undefined })), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    api.setSettings(patch).then(setSettings);
  }, []);
  const recordFreed = useCallback((bytes: number) => { if (bytes > 0) api.addFreed(bytes).then(setSettings); }, []);

  // Resolve the animation preference into <html data-motion>, re-evaluated when the OS setting changes.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const pref = settings?.motion || 'auto';
      const reduced = pref === 'off' || (pref === 'auto' && mq.matches);
      document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings?.motion]);

  // Appearance: follow the OS unless the user picked light or dark.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const pref = settings?.theme || 'system';
      const t = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
      setTheme(t);
      document.documentElement.dataset.theme = t;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings?.theme]);

  useEffect(() => {
    document.documentElement.dataset.material = api.env.material ? 'on' : 'off';
    document.documentElement.dataset.platform = api.env.platform.toLowerCase().startsWith('win') ? 'win' : 'mac';
  }, []);

  // Hover spotlight: feed the pointer position to the hovered surface (see styles: --mx / --my).
  useEffect(() => {
    const SPOT = '.row, .cat-row, .task, .sum-card, .drive-card, .nav-item, .side-list button';
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = (e.target as Element | null)?.closest?.(SPOT) as HTMLElement | null;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => { document.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // Keyboard: Ctrl/⌘+1…9 switch modules, Ctrl/⌘+, opens settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === ',') { e.preventDefault(); setShowSettings(true); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && MODULES[n - 1]) { e.preventDefault(); go(MODULES[n - 1].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  useEffect(() => {
    api.getSettings().then(setSettings);
    return api.onNavigate((p) => MODULES.some((m) => m.id === p) && go(p as ModuleId));
  }, [go]);

  useEffect(() => {
    refreshSys();
    const t = setInterval(refreshSys, 4000);
    return () => clearInterval(t);
  }, [refreshSys]);

  const mod = moduleById(active);
  const accent = tint(mod, theme);
  const style = { '--a1': accent, '--a1-ink': inkFor(accent) } as CSSProperties;
  const ctx = useMemo(() => ({ go, sys, refreshSys, setBadge, settings, theme, updateSettings, recordFreed, shared, share }), [go, sys, refreshSys, setBadge, settings, theme, updateSettings, recordFreed, shared, share]);

  const groups: { label?: string; items: typeof MODULES }[] = [];
  for (const m of MODULES) {
    const last = groups[groups.length - 1];
    if (last && last.label === m.group) last.items.push(m);
    else groups.push({ label: m.group, items: [m] });
  }

  return (
    <Ctx.Provider value={ctx}>
      <ToastProvider>
        <div className={`app ${navigator.userAgent.includes('Windows') ? 'is-win' : ''}`} style={style}>
          <Background />
          <div className="titlebar">
            <HelpButton module={active} />
          </div>
          <aside className="sidebar">
            <div className="brand">
              <img className="brand-logo" src={logo} alt="" />
              <div className="brand-text">
                <div className="brand-name">Cleanee</div>
              </div>
              <button className="icon-btn no-drag" style={{ marginLeft: 'auto' }} onClick={() => setShowSettings(true)} aria-label="設定" title="設定 (Ctrl+,)"><Settings2 size={17} /></button>
            </div>
            <nav className="nav">
              {groups.map((g, gi) => (
                <div className="nav-group" key={gi} style={gi === 0 ? { marginTop: 0 } : undefined}>
                  {g.label && <div className="nav-label">{g.label}</div>}
                  {g.items.map((m) => {
                    const b = badges[m.id];
                    const key = MODULES.indexOf(m) + 1;
                    return (
                      <button
                        key={m.id}
                        className={`nav-item ${active === m.id ? 'active' : ''}`}
                        style={{ '--c1': tint(m, theme) } as CSSProperties}
                        onClick={() => go(m.id)}
                        title={key <= 9 ? `${m.title}  (Ctrl+${key})` : m.title}
                      >
                        <span className="nav-icon"><m.icon size={17} strokeWidth={1.9} /></span>
                        <span className="nav-text">{m.title}</span>
                        {b?.busy ? <span className="dot" /> : b?.text ? <span className="badge">{b.text}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
            <SideStatus sys={sys} />
          </aside>
          <main className="main">
            {MODULES.filter((m) => visited.has(m.id)).map((m) => (
              <section
                key={m.id}
                className={`page ${active === m.id ? `page-in-${dir}` : leaving === m.id ? `page-out-${dir}` : ''}`}
                hidden={active !== m.id && leaving !== m.id}
                aria-hidden={active !== m.id}
              >
                {PAGES[m.id]()}
              </section>
            ))}
          </main>
          {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </div>
      </ToastProvider>
    </Ctx.Provider>
  );
}

function SideStatus({ sys }: { sys: SystemInfo | null }) {
  if (!sys) return null;
  const d = sys.drives[0];
  const used = d ? (d.total - d.free) / d.total : 0;
  const mem = (sys.memTotal - sys.memFree) / sys.memTotal;
  // Meters stay neutral and only turn amber / red when a resource is actually under pressure.
  const level = (r: number) => (r > 0.9 ? 'crit' : r > 0.8 ? 'warn' : '');
  const stat = (icon: ReactNode, label: string, value: string, ratio: number) => (
    <div className={`side-stat ${level(ratio)}`}>
      <div className="ss-row"><span>{icon}{label}</span><b>{value}</b></div>
      <div className="meter"><i style={{ width: `${Math.max(2, ratio * 100)}%` }} /></div>
    </div>
  );
  return (
    <div className="side-status">
      {d && stat(<HardDrive size={12} />, `ディスク ${d.mount.replace('\\', '')}`, `${formatBytes(d.free)} 空き`, used)}
      {stat(<MemoryStick size={12} />, 'メモリ', `${Math.round(mem * 100)}%`, mem)}
      {stat(<Cpu size={12} />, 'CPU', `${Math.round(sys.cpu * 100)}%`, sys.cpu)}
    </div>
  );
}
