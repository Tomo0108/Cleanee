import { useEffect, useMemo, useRef, useState } from 'react';
import { PackageX, Search, Loader2, LayoutGrid, Weight, Sparkle, Clock3, Trash2, FolderOpen } from 'lucide-react';
import { api } from '../api';
import type { InstalledApp, Leftover } from '../api/types';
import { useApp } from '../App';
import { formatBytes, formatDate, prettyPath } from '../lib/format';
import { PageHead, ListHead, AppIcon, HoverCard, DetailCard, Modal, Checkbox, useToast, useNativeIcon } from '../components/ui';

const parseDate = (s: string) => (/^\d{8}$/.test(s) ? new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)).getTime() : 0);
const DAY = 86400000;

type Filter = 'all' | 'large' | 'recent' | 'old';
type Sort = 'name' | 'size' | 'date';

export default function Uninstaller() {
  const { refreshSys } = useApp();
  const toast = useToast();
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<InstalledApp | null>(null);
  const [waiting, setWaiting] = useState<InstalledApp | null>(null);
  const [leftovers, setLeftovers] = useState<{ app: InstalledApp; items: Leftover[] } | null>(null);
  const poll = useRef<number>(0);

  const load = () => api.appsList().then(setApps);
  useEffect(() => { load(); return () => clearInterval(poll.current); }, []);

  const filters: { id: Filter; label: string; icon: typeof LayoutGrid; test: (a: InstalledApp) => boolean }[] = [
    { id: 'all', label: 'すべてのアプリ', icon: LayoutGrid, test: () => true },
    { id: 'large', label: '大きいアプリ', icon: Weight, test: (a) => a.size >= 500 * 1024 * 1024 },
    { id: 'recent', label: '最近インストール', icon: Sparkle, test: (a) => Date.now() - parseDate(a.installDate) < 30 * DAY },
    { id: 'old', label: '1 年以上前', icon: Clock3, test: (a) => { const d = parseDate(a.installDate); return d > 0 && Date.now() - d > 365 * DAY; } },
  ];

  const shown = useMemo(() => {
    const f = filters.find((x) => x.id === filter)!;
    const list = (apps || []).filter((a) => f.test(a) && `${a.name} ${a.publisher}`.toLowerCase().includes(q.toLowerCase()));
    if (sort === 'size') list.sort((a, b) => b.size - a.size);
    else if (sort === 'date') list.sort((a, b) => parseDate(b.installDate) - parseDate(a.installDate));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, filter, sort, q]);

  const start = async (app: InstalledApp) => {
    setConfirm(null);
    const r = await api.appUninstall(app.id);
    if (!r.ok) { toast(r.error || 'アンインストーラを起動できませんでした', 'err'); return; }
    setWaiting(app);
    const started = Date.now();
    clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      const still = await api.appInstalled(app.id);
      if (!still) {
        clearInterval(poll.current);
        setWaiting(null);
        const items = await api.appLeftovers(app.id);
        setApps((xs) => xs?.filter((x) => x.id !== app.id) || null);
        if (items.length) setLeftovers({ app, items });
        else toast(`${app.name} をアンインストールしました`);
        refreshSys();
      } else if (Date.now() - started > 15 * 60 * 1000) {
        clearInterval(poll.current);
        setWaiting(null);
      }
    }, 2000);
  };

  return (
    <>
      <PageHead icon={PackageX} title="アンインストール" sub={apps ? `${apps.length} 個 ・ ${formatBytes(apps.reduce((a, x) => a + x.size, 0))}` : 'アプリを読み込んでいます…'}>
        <div className="search"><Search size={15} /><input placeholder="アプリを検索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </PageHead>
      <div className="split">
        <div className="side-list">
          {filters.map((f) => (
            <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              <f.icon size={17} />{f.label}<span className="n">{apps ? apps.filter(f.test).length : ''}</span>
            </button>
          ))}
          <div className="nav-label" style={{ marginTop: 18 }}>並べ替え</div>
          {([['name', '名前'], ['size', 'サイズ'], ['date', 'インストール日']] as [Sort, string][]).map(([k, l]) => (
            <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
        <div className="glass-scroll">
          {!apps ? <div className="empty" style={{ minHeight: 300 }}><Loader2 className="spin" /></div> : (
            <>
            <ListHead cols={[{ w: 38 }, { label: 'アプリ', grow: true }, { label: 'インストール日', w: 90, align: 'right' }, { label: 'サイズ', w: 84, align: 'right' }, { w: 136 }]} />
            <div className="rows">
              {shown.map((a, i) => <AppRow key={a.id} app={a} i={i} busy={waiting?.id === a.id} onUninstall={() => setConfirm(a)} />)}
              {!shown.length && <div className="empty" style={{ minHeight: 200 }}>該当するアプリはありません</div>}
            </div>
            </>
          )}
        </div>
      </div>

      {confirm && (
        <Modal title={`${confirm.name} をアンインストールしますか？`} onClose={() => setConfirm(null)} actions={<>
          <button className="btn ghost" onClick={() => setConfirm(null)}>キャンセル</button>
          <button className="btn danger" onClick={() => start(confirm)}>アンインストール</button>
        </>}>
          <p>付属のアンインストーラが起動します。完了後に残りファイルを検出します。</p>
        </Modal>
      )}
      {waiting && (
        <div className="toasts" style={{ left: '50%', right: 'auto', transform: 'translateX(-50%)' }}>
          <div className="toast info"><span className="ti"><Loader2 size={15} className="spin" /></span>
            <span style={{ flex: 1 }}>{waiting.name} のアンインストールを待っています…</span>
            <button className="btn sm ghost" onClick={() => { clearInterval(poll.current); setWaiting(null); }}>閉じる</button>
          </div>
        </div>
      )}
      {leftovers && <LeftoverModal data={leftovers} onClose={() => setLeftovers(null)} />}
    </>
  );
}

function AppRow({ app, i, busy, onUninstall }: { app: InstalledApp; i: number; busy: boolean; onUninstall: () => void }) {
  const icon = useNativeIcon(`app:${app.id}`, () => api.appIcon(app.id));
  const date = parseDate(app.installDate);
  return (
    <div className="row" style={{ animation: `rise .4s ${Math.min(i, 14) * 25}ms both` }}>
      <AppIcon src={icon} />
      <div className="grow">
        <div className="t">
          <HoverCard content={
            <DetailCard
              icon={<AppIcon src={icon} />} title={app.name} sub={app.publisher || '発行元不明'}
              rows={[
                ['バージョン', app.version],
                ['インストール日', date ? formatDate(date) : '不明'],
                ['サイズ', app.size ? formatBytes(app.size) : '不明'],
                ['対象', app.scope === 'user' ? '現在のユーザー' : 'すべてのユーザー'],
                ['場所', app.location ? <span className="mono">{app.location}</span> : null],
                ['アンインストーラ', app.uninstall ? <span className="mono">{app.uninstall}</span> : null],
              ]}
              actions={<>
                {app.location && <button className="btn sm" onClick={() => api.reveal(app.location)}><FolderOpen size={13} />場所を開く</button>}
                <button className="btn sm danger" onClick={onUninstall} disabled={busy}><Trash2 size={13} />アンインストール</button>
              </>}
            />
          }>{app.name}</HoverCard>
        </div>
        <div className="sub">{app.publisher || '発行元不明'}{app.version ? ` ・ バージョン ${app.version}` : ''}</div>
      </div>
      <div className="meta">{date ? formatDate(date) : ''}</div>
      <div className="num">{app.size ? formatBytes(app.size) : '—'}</div>
      <button className={`btn sm row-action ${busy ? "busy" : ""}`} style={{ width: 136 }} onClick={onUninstall} disabled={busy}>
        {busy ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}アンインストール
      </button>
    </div>
  );
}

function LeftoverModal({ data, onClose }: { data: { app: InstalledApp; items: Leftover[] }; onClose: () => void }) {
  const toast = useToast();
  const { recordFreed } = useApp();
  const [sel, setSel] = useState<Set<string>>(new Set(data.items.map((x) => x.path)));
  const total = data.items.filter((x) => sel.has(x.path)).reduce((a, x) => a + x.size, 0);
  const remove = async () => {
    const r = await api.trash([...sel]);
    recordFreed(total);
    toast(`残りファイル ${formatBytes(total)} をごみ箱に移動しました${r.failed ? `（${r.failed} 件失敗）` : ''}`);
    onClose();
  };
  return (
    <Modal title="残りファイルが見つかりました" onClose={onClose} actions={<>
      <button className="btn ghost" onClick={onClose}>残す</button>
      <button className="btn primary" disabled={!sel.size} onClick={remove}>{formatBytes(total)} をごみ箱へ</button>
    </>}>
      <p>{data.app.name} のフォルダが残っています</p>
      <div className="modal-list">
        {data.items.map((x) => (
          <label key={x.path} className="row" style={{ cursor: 'pointer' }}>
            <Checkbox checked={sel.has(x.path)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(x.path) : n.delete(x.path); return n; })} />
            <div className="grow"><div className="sub mono" style={{ color: 'var(--text)' }} title={x.path}>{prettyPath(x.path)}</div><div className="sub">{x.count} 個のファイル</div></div>
            <div className="num" style={{ minWidth: 70 }}>{formatBytes(x.size)}</div>
            <button className="icon-btn row-action" aria-label="場所を表示" onClick={(e) => { e.preventDefault(); api.reveal(x.path); }}><FolderOpen size={15} /></button>
          </label>
        ))}
      </div>
    </Modal>
  );
}
