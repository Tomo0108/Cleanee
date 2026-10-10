import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ShieldCheck, ShieldAlert, Radar, RefreshCw, Activity, BugOff, Loader2, CheckCircle2, XCircle, ChevronRight, ExternalLink, AlertTriangle, Info, X } from 'lucide-react';
import { api } from '../api';
import type { DefenderStatus, DefenderThreat } from '../api/types';
import { useApp } from '../App';
import { formatDate, timeAgo } from '../lib/format';
import { explainThreat, encyclopediaUrl, describeResource, verdict, severityLevel, nameSegments, THREAT_STATUS, DETECTION_SOURCE, CLEANING_ACTION, SEVERITY } from '../lib/threats';
import { IdleHero, ScanningHero, ScanDock, PageHead, Modal, useToast } from '../components/ui';
import { HELP } from '../help';

const RESOLVED = [2, 3, 4, 5, 6];
const sev = (n: number) => SEVERITY[n] || SEVERITY[0];

export default function Protection() {
  const { setBadge, shared, share } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<'idle' | 'checking' | 'ready'>('idle');
  const [st, setSt] = useState<DefenderStatus | null>(null);
  const [scanning, setScanning] = useState<'quick' | 'full' | null>(null);
  const [updating, setUpdating] = useState(false);
  const [detail, setDetail] = useState<DefenderThreat | null>(null);

  const load = () => api.defenderStatus().then((s) => { setSt(s); share({ defender: { status: s, at: Date.now() } }); });

  // Show the status Smart Scan just fetched instead of checking again.
  const adoptedAt = useRef(0);
  useEffect(() => {
    const d = shared.defender;
    if (!d || d.at <= adoptedAt.current || scanning) return;
    adoptedAt.current = d.at;
    setSt(d.status);
    setPhase('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.defender]);
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

  const removeThreats = async () => {
    await api.defenderRemove();
    toast('脅威の削除を実行しました');
    setDetail(null);
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
          {active.length > 0 && <button className="btn danger sm" onClick={removeThreats}>脅威を削除</button>}
        </h3>
        {(st.threats || []).length === 0 ? (
          <div className="card" style={{ padding: 22, textAlign: 'center' }} ><span className="muted">検出された脅威はありません</span></div>
        ) : (
          <div className="rows">
            {st.threats!.map((t) => {
              const done = RESOLVED.includes(t.status);
              const kind = explainThreat(t.name, t.category).type;
              return (
                <div className="row threat-row" key={t.id + t.time} role="button" tabIndex={0} title="なぜ脅威なのかを表示"
                  onClick={() => setDetail(t)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(t); } }}>
                  <div className="kind-icon" style={{ '--k': done ? 'var(--ok)' : 'var(--danger)' } as CSSProperties}><BugOff size={18} /></div>
                  <div className="grow">
                    <div className="t">{t.name || '不明な脅威'}{kind && <span className="threat-kind">{kind.label}</span>}</div>
                    <div className="sub mono">{describeResource(t.resources[0] || '').path}</div>
                  </div>
                  <span className={`chip ${sev(t.severity)[2]}`}>深刻度: {sev(t.severity)[0]}</span>
                  <span className={`chip ${done ? 'ok' : 'danger'}`}>{done ? '対処済み' : '未対処'}</span>
                  <div className="meta">{formatDate(t.time)}</div>
                  <ChevronRight size={16} className="faint" />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {detail && <ThreatDetail t={detail} onClose={() => setDetail(null)} onRemove={removeThreats} />}
    </>
  );
}

/** Explains why Defender flagged something: the verdict first, then what it is, then the technical record. */
function ThreatDetail({ t, onClose, onRemove }: { t: DefenderThreat; onClose: () => void; onRemove: () => void }) {
  const x = explainThreat(t.name, t.category);
  const harmless = /^eicar/i.test(x.parsed.family || '');
  const v = verdict(t.status, harmless);
  const [statusLabel] = THREAT_STATUS[t.status] || THREAT_STATUS[0];
  const [sevLabel, sevNote] = harmless ? ['なし', 'テスト用のファイルのため危険はありません。'] : sev(t.severity);
  const level = harmless ? 0 : severityLevel(t.severity);
  const segs = nameSegments(x.parsed, x);
  const files = t.resources.map(describeResource);
  const VIcon = v.tone === 'ok' ? ShieldCheck : v.tone === 'warn' ? AlertTriangle : ShieldAlert;
  const title = x.type?.label || x.categoryLabel || '検出された項目';
  const process = t.process && t.process !== 'Unknown' ? t.process : '';

  return (
    <Modal className="threat-sheet" onClose={onClose} actions={<>
      {t.name && <a className="btn ghost" href={encyclopediaUrl(t.name)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Microsoft の解説</a>}
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={onClose}>閉じる</button>
    </>}>
      <header className="ts-head">
        <div className={`ts-icon ${v.tone}`}><BugOff size={22} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{title}</h3>
          <div className="ts-name mono" title={t.name}>{t.name || '名前のない検出'}</div>
        </div>
        <button className="icon-btn" aria-label="閉じる" onClick={onClose}><X size={16} /></button>
      </header>

      <div className="ts-body">
        <p className="ts-lead">{x.type ? x.type.what : 'Microsoft Defender の脅威定義に一致したため検出されました。詳しくは「Microsoft の解説」で確認できます。'}</p>

        <div className={`ts-verdict ${v.tone}`}>
          <VIcon size={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ts-verdict-title">{v.title}<span className="ts-status">{statusLabel}</span></div>
            <div className="ts-verdict-body">{v.body}</div>
          </div>
          {v.needsAction && <button className="btn danger" onClick={onRemove}>脅威を削除</button>}
        </div>

        <div className="ts-facts">
          <div className="ts-fact" title={sevNote}>
            <span className="ts-k">深刻度</span>
            <b>{sevLabel}</b>
            <span className={`ts-meter l${level}`} aria-label={`4 段階中 ${level}`}>{[1, 2, 3, 4].map((i) => <i key={i} className={i <= level ? 'on' : ''} />)}</span>
          </div>
          <div className="ts-fact">
            <span className="ts-k">検出方法</span>
            <b>{(t.source && DETECTION_SOURCE[t.source]) || '不明'}</b>
            <span className="ts-s">{t.action && CLEANING_ACTION[t.action] ? `処理: ${CLEANING_ACTION[t.action]}${t.actionSuccess === false ? '（失敗）' : ''}` : ''}</span>
          </div>
          <div className="ts-fact">
            <span className="ts-k">検出日</span>
            <b>{formatDate(t.time)}</b>
            <span className="ts-s">{timeAgo(t.time)}</span>
          </div>
        </div>

        {(x.type || x.suffixNote || t.executed) && (
          <div className="ts-notes">
            {x.type && <div className={`ts-callout ${harmless ? '' : 'warn'}`}><AlertTriangle size={14} /><span><b>想定される被害</b>{x.type.risk}</span></div>}
            {t.executed && <div className="ts-callout bad"><AlertTriangle size={14} /><span><b>実行の形跡あり</b>このプログラムは検出される前に実行されていました。</span></div>}
            {x.suffixNote && <div className="ts-callout"><Info size={14} /><span><b>検出の根拠</b>{x.suffixNote}</span></div>}
          </div>
        )}

        {files.length > 0 && (
          <section className="ts-sec">
            <h4>検出された場所</h4>
            <div className="ts-files">
              {files.map((f, i) => {
                const [outer, inner] = f.path.split('->');
                const name = (inner || outer).split(/[\\/]/).pop();
                return (
                  <div className="ts-file" key={i}>
                    <span className="ts-file-name">{name}{f.kind && <span className="chip">{f.kind}</span>}</span>
                    <span className="mono ts-file-path">{inner ? `${outer} の中` : outer}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <details className="ts-more">
          <summary><ChevronRight size={14} />技術的な詳細</summary>
          {segs.length > 0 && <>
            <div className="ts-k" style={{ margin: '10px 0 6px' }}>判定名の読み方</div>
            <div className="ts-segs mono">
              {segs.map((g) => <span key={g.key}>{g.sep && <span className="ts-sep">{g.sep}</span>}<span className={`ts-seg ${g.key}`}>{g.text}</span></span>)}
            </div>
            <dl className="ts-legend">
              {segs.map((g) => <div key={g.key}><dt><i className={`ts-dot ${g.key}`} />{g.label}</dt><dd><span className="mono">{g.text}</span> — {g.note}</dd></div>)}
            </dl>
          </>}
          <div className="ts-k" style={{ margin: '12px 0 6px' }}>検出記録</div>
          <dl className="ts-legend">
            <div><dt>検出日時</dt><dd>{new Date(t.time).toLocaleString('ja-JP')}</dd></div>
            {!!t.remediated && <div><dt>対処日時</dt><dd>{new Date(t.remediated).toLocaleString('ja-JP')}</dd></div>}
            {process && <div><dt>検出時のプロセス</dt><dd className="mono">{process}</dd></div>}
            {t.user && <div><dt>ユーザー</dt><dd>{t.user}</dd></div>}
            <div><dt>脅威 ID</dt><dd className="mono">{t.id}</dd></div>
          </dl>
        </details>
      </div>
    </Modal>
  );
}
