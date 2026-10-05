import { useEffect, useState, type CSSProperties } from 'react';
import { CircleGauge, MemoryStick, Power, Loader2, Search, FolderOpen } from 'lucide-react';
import { api } from '../api';
import type { StartupItem } from '../api/types';
import { useApp } from '../App';
import { formatBytes } from '../lib/format';
import { PageHead, ListHead, AppIcon, HoverCard, DetailCard, Toggle, Segmented, useToast, useNativeIcon, useAnimatedNumber } from '../components/ui';
import { AdminNotice } from '../components/Results';

export default function Optimize() {
  const { sys, refreshSys } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<StartupItem[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all');
  const [q, setQ] = useState('');
  const [freeing, setFreeing] = useState(false);

  const load = () => api.startupList().then(setItems);
  useEffect(() => { load(); }, []);

  const toggle = async (it: StartupItem, v: boolean) => {
    setItems((xs) => xs?.map((x) => (x === it ? { ...x, enabled: v } : x)) || null);
    const r = await api.startupToggle(it, v);
    if (!r.ok) {
      setItems((xs) => xs?.map((x) => (x.name === it.name && x.hive === it.hive ? { ...x, enabled: !v } : x)) || null);
      toast(r.error || '変更できませんでした', 'err');
    } else toast(`${it.description || it.name} を${v ? '有効' : '無効'}にしました`);
  };

  const freeRam = async () => {
    setFreeing(true);
    const r = await api.runTask('freeRam');
    setFreeing(false);
    refreshSys();
    toast(r.freed ? `${formatBytes(r.freed)} のメモリを解放しました` : r.message, r.ok ? 'ok' : 'err');
  };

  const memUsed = sys ? sys.memTotal - sys.memFree : 0;
  const memRatio = useAnimatedNumber(sys ? memUsed / sys.memTotal : 0);
  const enabled = items?.filter((i) => i.enabled).length || 0;
  const shown = (items || []).filter((i) => (filter === 'all' || (filter === 'on') === i.enabled) && `${i.name} ${i.description} ${i.company}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHead icon={CircleGauge} title="最適化" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16, flex: 'none' }}>
        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 18 }}>
          <Ring ratio={memRatio} label={`${Math.round(memRatio * 100)}%`} color={memRatio > 0.85 ? 'var(--warn)' : undefined} />
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><MemoryStick size={14} />メモリ使用量</div>
            <div style={{ fontWeight: 700, fontSize: 19, margin: '2px 0 10px' }}>{formatBytes(memUsed)} <span className="faint" style={{ fontWeight: 500, fontSize: 14 }}>/ {sys ? formatBytes(sys.memTotal, 0) : '—'}</span></div>
            <button className="btn sm primary" onClick={freeRam} disabled={freeing}>{freeing ? <Loader2 size={14} className="spin" /> : null}メモリを解放</button>
          </div>
        </div>
        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 18 }}>
          <Ring ratio={items?.length ? enabled / items.length : 0} label={`${enabled}`} />
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><Power size={14} />スタートアップ</div>
            <div style={{ fontWeight: 700, fontSize: 19, margin: '2px 0 0' }}>{enabled} <span className="faint" style={{ fontWeight: 500, fontSize: 14 }}>/ {items?.length ?? 0} 個が有効</span></div>
          </div>
        </div>
      </div>
      <AdminNotice text="「全ユーザー」の項目の変更には管理者権限が必要です" />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flex: 'none' }}>
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: `すべて ${items?.length ?? ''}` }, { value: 'on', label: '有効' }, { value: 'off', label: '無効' }]} />
        <div className="search" style={{ marginLeft: 'auto' }}><Search size={15} /><input placeholder="検索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="glass-scroll">
        {!items ? (
          <div className="empty" style={{ minHeight: 200 }}><Loader2 className="spin" /></div>
        ) : (
          <>
          <ListHead cols={[{ w: 38 }, { label: 'アプリ', grow: true }, { label: '自動起動', w: 190, align: 'right' }]} />
          <div className="rows">
            {shown.map((it, i) => <StartupRow key={it.hive + it.approvedKey + it.name} it={it} i={i} onToggle={(v) => toggle(it, v)} />)}
          </div>
          </>
        )}
      </div>
    </>
  );
}

function StartupRow({ it, i, onToggle }: { it: StartupItem; i: number; onToggle: (v: boolean) => void }) {
  const icon = useNativeIcon(it.exe ? `file:${it.exe}` : null, () => api.fileIcon(it.exe));
  const title = it.description || it.name.replace(/\.lnk$/i, '');
  return (
    <div className="row" style={{ animation: `rise .4s ${Math.min(i, 12) * 30}ms both`, opacity: it.enabled ? 1 : 0.62 }}>
      <AppIcon src={icon} />
      <div className="grow">
        <div className="t">
          <HoverCard content={
            <DetailCard
              icon={<AppIcon src={icon} />} title={title} sub={it.company || '発行元不明'}
              rows={[
                ['状態', it.enabled ? '起動時に実行' : '無効'],
                ['登録名', it.name],
                ['登録場所', it.source === 'folder' ? 'スタートアップフォルダ' : 'レジストリ (Run)'],
                ['対象', it.scope === 'user' ? '現在のユーザー' : 'すべてのユーザー'],
                ['実行ファイル', it.exe ? <span className="mono">{it.exe}</span> : null],
                ['コマンド', <span className="mono">{it.command}</span>],
              ]}
              actions={it.exe ? <button className="btn sm" onClick={() => api.reveal(it.exe)}><FolderOpen size={13} />場所を開く</button> : undefined}
            />
          }>{title}</HoverCard>
        </div>
        <div className="sub">{it.company || '発行元不明'}</div>
      </div>
      <div className="row-trail" style={{ width: 190 }}>
        {it.scope === 'machine' && <span className="chip" data-tip="すべてのユーザーに適用">全ユーザー</span>}
        {it.exe && <button className="icon-btn" data-tip="ファイルの場所" onClick={() => api.reveal(it.exe)}><FolderOpen size={15} /></button>}
        <Toggle on={it.enabled} onChange={onToggle} />
      </div>
    </div>
  );
}

/** Circular gauge. Uses the module tint unless the value is under pressure. */
export function Ring({ ratio, label, size = 64, color = 'var(--a1)' }: { ratio: number; label: string; size?: number; color?: string }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, ratio));
  return (
    <div className="ring" style={{ width: size, height: size } as CSSProperties}>
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <circle className="ring-track" cx="32" cy="32" r={r} />
        <circle className="ring-value" cx="32" cy="32" r={r} style={{ stroke: color }} strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      <span>{label}</span>
    </div>
  );
}
