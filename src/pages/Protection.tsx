import { useState, type CSSProperties } from 'react';
import { ShieldCheck, ShieldAlert, Radar, RefreshCw, Activity, BugOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../api';
import type { DefenderStatus } from '../api/types';
import { useApp } from '../App';
import { formatDate, timeAgo } from '../lib/format';
import { IdleHero, ScanningHero, ScanDock, PageHead, useToast } from '../components/ui';
import { HELP } from '../help';

const RESOLVED = [2, 3, 4, 5, 6];
const SEVERITY = ['不明', '低', '中', '高', '高', '深刻'];

export default function Protection() {
  const { setBadge } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<'idle' | 'checking' | 'ready'>('idle');
  const [st, setSt] = useState<DefenderStatus | null>(null);
  const [scanning, setScanning] = useState<'quick' | 'full' | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = () => api.defenderStatus().then(setSt);
  const check = async () => {
    setPhase('checking');
    setBadge('protection', { busy: true });
    await load();
    setBadge('protection', null);
    setPhase('ready');
  };

  const scan = async (type: 'quick' | 'full') => {
    setScanning(type);
    setBadge('protection', { busy: true });
    const r = await api.defenderScan(type);
    setScanning(null);
    setBadge('protection', null);
    toast(r.threats ? '脅威が検出されました。詳細を確認してください。' : r.ok ? '脅威は見つかりませんでした' : 'スキャンを完了できませんでした', r.threats || !r.ok ? 'err' : 'ok');
    load();
  };

  const update = async () => {
    setUpdating(true);
    await api.defenderUpdate();
    setUpdating(false);
    toast('ウイルス定義を更新しました');
    load();
  };

  if (scanning) {
    return (
      <>
        <ScanningHero icon={Radar} title={scanning === 'quick' ? 'クイックスキャン中' : 'フルスキャン中'}>
        </ScanningHero>
        <ScanDock label="待機中" ghost disabled onClick={() => {}} />
      </>
    );
  }

  if (phase === 'idle') {
    return (
      <>
        <IdleHero icon={ShieldCheck} title="マルウェア対策" tagline={HELP.protection.tagline} onActivate={check} actionLabel="チェック" />
        <ScanDock label="チェック" onClick={check} />
      </>
    );
  }

  if (phase === 'checking' || !st) return <ScanningHero icon={ShieldCheck} title="保護の状態を確認しています" />;

  if (!st.available) {
    return (
      <div className="empty">
        <div>
          <ShieldAlert size={48} />
          <h2 style={{ margin: '6px 0' }}>Microsoft Defender を利用できません</h2>
          <p className="muted">他のウイルス対策ソフトが有効な可能性があります</p>
        </div>
      </div>
    );
  }

  const active = (st.threats || []).filter((t) => !RESOLVED.includes(t.status));
  const ok = !!st.realtime && !!st.antivirus && active.length === 0;
  const items = [
    { icon: Activity, label: 'リアルタイム保護', value: st.realtime ? '有効' : '無効', good: !!st.realtime },
    { icon: RefreshCw, label: 'ウイルス定義', value: st.signatureUpdated ? `${timeAgo(st.signatureUpdated)}に更新` : '不明', sub: st.signatureVersion, good: (st.signatureAge ?? 99) <= 3 },
    { icon: Radar, label: '最後のクイックスキャン', value: st.lastQuickScan ? timeAgo(st.lastQuickScan) : '未実行', good: (st.quickScanAge ?? 99) <= 7 },
    { icon: BugOff, label: '未解決の脅威', value: active.length ? `${active.length} 件` : 'なし', good: active.length === 0 },
  ];

  return (
    <>
      <PageHead icon={ShieldCheck} title="マルウェア対策">
        <button className="btn" onClick={update} disabled={updating}>{updating ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}定義を更新</button>
        <button className="btn" onClick={() => scan('full')}>フルスキャン</button>
      </PageHead>
      <div className="glass-scroll">
        <div className={`status-banner ${ok ? 'ok' : 'bad'}`}>
          <span className="sb-icon">{ok ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sb-title">{ok ? 'PC は保護されています' : active.length ? '脅威が検出されています' : '保護が無効になっています'}</div>
            <div className="sb-sub">{ok ? 'リアルタイム保護が有効で、未解決の脅威はありません' : active.length ? '検出履歴から脅威を削除してください' : 'Windows セキュリティでリアルタイム保護を有効にしてください'}</div>
          </div>
          <button className="btn ghost sm" onClick={check}>再チェック</button>
          <button className="btn primary" onClick={() => scan('quick')}><Radar size={15} />クイックスキャン</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 22 }}>
          {items.map((it, i) => (
            <div key={it.label} className="card" style={{ padding: 16, animation: `rise .5s ${i * 60}ms both` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12.5, marginBottom: 8 }}><it.icon size={15} />{it.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 17 }}>
                {it.good ? <CheckCircle2 size={18} color="var(--ok)" /> : <XCircle size={18} color="var(--danger)" />}{it.value}
              </div>
              {it.sub && <div className="faint mono" style={{ fontSize: 11, marginTop: 4 }}>{it.sub}</div>}
            </div>
          ))}
        </div>
        <h3 style={{ fontSize: 15, margin: '0 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          検出履歴
          {active.length > 0 && <button className="btn danger sm" onClick={async () => { await api.defenderRemove(); toast('脅威の削除を実行しました'); load(); }}>脅威を削除</button>}
        </h3>
        {(st.threats || []).length === 0 ? (
          <div className="card" style={{ padding: 22, textAlign: 'center' }} ><span className="muted">検出された脅威はありません</span></div>
        ) : (
          <div className="rows">
            {st.threats!.map((t) => (
              <div className="row" key={t.id + t.time}>
                <div className="kind-icon" style={{ '--k': RESOLVED.includes(t.status) ? 'var(--ok)' : 'var(--danger)' } as CSSProperties}><BugOff size={18} /></div>
                <div className="grow">
                  <div className="t">{t.name || '不明な脅威'}</div>
                  <div className="sub mono">{(t.resources[0] || '').replace(/^\w+:_/, '')}</div>
                </div>
                <span className={`chip ${t.severity >= 4 ? 'danger' : t.severity >= 2 ? 'warn' : ''}`}>深刻度: {SEVERITY[t.severity] || '不明'}</span>
                <span className={`chip ${RESOLVED.includes(t.status) ? 'ok' : 'danger'}`}>{RESOLVED.includes(t.status) ? '対処済み' : '未対処'}</span>
                <div className="meta">{formatDate(t.time)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
