import { useEffect, useState } from 'react';
import { RefreshCcw, Loader2, CheckCircle2, AlertCircle, ArrowRight, PackageCheck } from 'lucide-react';
import { api } from '../api';
import type { UpdateItem } from '../api/types';
import { useApp } from '../App';
import { PageHead, ListHead, AppIcon, HoverCard, DetailCard, useNativeIcon, Checkbox, ScanningHero, useToast } from '../components/ui';

type St = 'pending' | 'running' | 'done' | 'error';

export default function Updater() {
  const { setBadge } = useApp();
  const toast = useToast();
  const [data, setData] = useState<{ available: boolean; items: UpdateItem[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [st, setSt] = useState<Record<string, { s: St; msg?: string }>>({});
  const [running, setRunning] = useState(false);

  const load = async () => {
    setData(null);
    const d = await api.updatesList();
    setData(d);
    setSel(new Set(d.items.map((x) => x.id)));
    setSt({});
    setBadge('updater', d.items.length ? { text: String(d.items.length) } : null);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = async () => {
    setRunning(true);
    const ids = data!.items.filter((x) => sel.has(x.id) && st[x.id]?.s !== 'done').map((x) => x.id);
    setSt((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, { s: 'pending' as St }])) }));
    let ok = 0;
    for (const id of ids) {
      setSt((s) => ({ ...s, [id]: { s: 'running' } }));
      const r = await api.updateInstall(id);
      if (r.ok) ok++;
      setSt((s) => ({ ...s, [id]: { s: r.ok ? 'done' : 'error', msg: r.message } }));
    }
    setRunning(false);
    const left = data!.items.length - Object.values(st).filter((x) => x.s === 'done').length - ok;
    setBadge('updater', left > 0 ? { text: String(left) } : null);
    toast(`${ok} 個のアプリを更新しました`, ok === ids.length ? 'ok' : 'info');
  };

  if (!data) return <ScanningHero icon={RefreshCcw} title="アップデートを確認中" />;

  if (!data.available) {
    return (
      <div className="empty"><div>
        <AlertCircle size={44} />
        <h2 style={{ margin: '6px 0' }}>winget が見つかりません</h2>
        <p className="muted">Microsoft Store の「アプリ インストーラー」が必要です</p>
      </div></div>
    );
  }

  if (!data.items.length) {
    return (
      <div className="empty"><div>
        <PackageCheck size={52} style={{ color: 'var(--ok)' }} />
        <h2 style={{ margin: '6px 0' }}>すべてのアプリが最新です</h2>
        <div style={{ height: 14 }} />
        <button className="btn" onClick={load}>再確認</button>
      </div></div>
    );
  }

  return (
    <>
      <PageHead icon={RefreshCcw} title="アップデート" sub={`${data.items.length} 件のアップデート`}>
        <button className="btn ghost" onClick={load} disabled={running}>再確認</button>
      </PageHead>
      <div className="glass-scroll">
        <ListHead cols={[{ w: 20 }, { w: 38 }, { label: 'アプリ', grow: true }, { label: 'バージョン', w: 220, align: 'right' }, { label: '状態', w: 110, align: 'right' }]} />
        <div className="rows">
          {data.items.map((u, i) => {
            const s = st[u.id];
            return (
              <label key={u.id} className={`row ${sel.has(u.id) ? 'sel' : ''}`} style={{ cursor: 'pointer', animation: `rise .4s ${i * 35}ms both` }}>
                <Checkbox checked={sel.has(u.id)} disabled={running || s?.s === 'done'} onChange={(v) => setSel((x) => { const n = new Set(x); v ? n.add(u.id) : n.delete(u.id); return n; })} />
                <UpdateIcon name={u.name} />
                <div className="grow">
                  <div className="t">
                    <HoverCard content={
                      <DetailCard
                        icon={<UpdateIcon name={u.name} />} title={u.name} sub={u.id}
                        rows={[
                          ['現在のバージョン', u.version],
                          ['最新バージョン', <b>{u.available}</b>],
                          ['入手元', u.source || 'winget'],
                          ['パッケージ ID', <span className="mono">{u.id}</span>],
                        ]}
                      />
                    }>{u.name}</HoverCard>
                  </div>
                  <div className="sub mono">{u.id}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                  <span className="faint">{u.version}</span><ArrowRight size={14} className="faint" /><b>{u.available}</b>
                </div>
                <div style={{ width: 110, display: 'flex', justifyContent: 'flex-end' }}>
                  {s?.s === 'running' && <span className="chip accent"><Loader2 size={12} className="spin" />更新中</span>}
                  {s?.s === 'pending' && <span className="chip">待機中</span>}
                  {s?.s === 'done' && <span className="chip ok"><CheckCircle2 size={12} />完了</span>}
                  {s?.s === 'error' && <span className="chip danger" title={s.msg}><AlertCircle size={12} />失敗</span>}
                </div>
              </label>
            );
          })}
        </div>
      </div>
      <div className="footer-bar">
        <span className="muted">{sel.size} 個選択</span>
        <button className="btn primary pill big" disabled={!sel.size || running} onClick={update}>
          {running ? <><Loader2 size={16} className="spin" />更新中</> : 'アップデート'}
        </button>
      </div>
    </>
  );
}

function UpdateIcon({ name }: { name: string }) {
  const src = useNativeIcon(`name:${name}`, () => api.appIconByName(name));
  return <AppIcon src={src} />;
}
