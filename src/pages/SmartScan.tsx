import { useState, type CSSProperties } from 'react';
import { MonitorCheck, Trash2, ShieldCheck, CircleGauge, CheckCircle2, Loader2, Circle, History, HardDrive, ArrowRight } from 'lucide-react';
import { api } from '../api';
import type { DefenderStatus, JunkCategory, JunkProgress, StartupItem } from '../api/types';
import { useApp } from '../App';
import { formatBytes, timeAgo } from '../lib/format';
import { HELP } from '../help';
import { moduleById, tint } from '../modules';
import { IdleHero, ScanningHero, ScanDock, useProgress } from '../components/ui';
import { DoneHero } from '../components/Results';

type Phase = 'idle' | 'scanning' | 'summary' | 'running' | 'done';
const STAGES = [
  { key: 'clean', label: 'クリーンアップ', icon: Trash2 },
  { key: 'protect', label: '保護', icon: ShieldCheck },
  { key: 'speed', label: 'スピード', icon: CircleGauge },
] as const;

export default function SmartScan() {
  const { go, sys, setBadge, refreshSys, settings, recordFreed, theme, share } = useApp();
  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState(0);
  const [prog, setProg] = useState<JunkProgress>({ category: '', total: 0 });
  const [junk, setJunk] = useState<JunkCategory[]>([]);
  const [defender, setDefender] = useState<DefenderStatus | null>(null);
  const [startup, setStartup] = useState<StartupItem[]>([]);
  const [freed, setFreed] = useState(0);
  const [runStage, setRunStage] = useState('');

  useProgress<JunkProgress>('junk', (d) => phase === 'scanning' && setProg(d));

  const scan = async () => {
    setPhase('scanning');
    setBadge('smart', { busy: true });
    setStage(0);
    setProg({ category: '', total: 0 });
    const j = await api.junkScan();
    if (!j.length) { setPhase('idle'); setBadge('smart', null); return; }
    setJunk(j);
    share({ junk: { cats: j, at: Date.now() } });
    setStage(1);
    const [d] = await Promise.all([api.defenderStatus().catch(() => ({ available: false }) as DefenderStatus), new Promise((r) => setTimeout(r, 600))]);
    setDefender(d);
    share({ defender: { status: d, at: Date.now() } });
    setStage(2);
    const [s] = await Promise.all([api.startupList().catch(() => []), new Promise((r) => setTimeout(r, 600))]);
    setStartup(s);
    setStage(3);
    setPhase('summary');
    setBadge('smart', null);
  };

  const junkIds = junk.filter((c) => c.selected && c.size > 0).map((c) => c.id);
  const junkSize = junk.filter((c) => junkIds.includes(c.id)).reduce((a, c) => a + c.size, 0);
  const threats = (defender?.threats || []).filter((t) => ![2, 3, 4, 5, 6].includes(t.status)).length;
  const protectOk = !!defender?.available && !!defender.realtime && threats === 0;
  const enabledStartup = startup.filter((s) => s.enabled).length;
  const memRatio = sys ? (sys.memTotal - sys.memFree) / sys.memTotal : 0;

  const run = async () => {
    setPhase('running');
    setBadge('smart', { busy: true });
    setRunStage('ジャンクを削除中');
    const r = await api.junkClean(junkIds);
    share({ junk: undefined });
    setRunStage('メモリを解放中');
    await api.runTask('freeRam');
    setRunStage('DNS キャッシュを更新中');
    await api.runTask('flushDns');
    setFreed(r.freed);
    recordFreed(r.freed);
    setPhase('done');
    setBadge('smart', null);
    refreshSys();
  };

  if (phase === 'idle') {
    return (
      <>
        <IdleHero
          icon={MonitorCheck}
          onActivate={scan}
          title="スマートスキャン"
          tagline={HELP.smart.tagline}
          extra={<>
            {settings && settings.lastClean > 0 && <span className="stat-pill"><History size={13} />前回の実行 <b>{timeAgo(settings.lastClean)}</b></span>}
            {settings && settings.totalFreed > 0 && <span className="stat-pill"><HardDrive size={13} />これまでに <b>{formatBytes(settings.totalFreed)}</b> 解放</span>}
          </>}
        />
        <ScanDock onClick={scan} />
      </>
    );
  }

  if (phase === 'scanning') {
    return (
      <>
        <ScanningHero icon={MonitorCheck} title={stage === 0 ? 'システムを分析中' : stage === 1 ? '保護の状態を確認中' : 'スピードを分析中'} bytes={prog.total} path={stage === 0 ? prog.current : undefined}>
          <StageChips stage={stage} />
        </ScanningHero>
        <ScanDock label="停止" ghost onClick={() => api.cancel('junk')} />
      </>
    );
  }

  if (phase === 'running') {
    return <ScanningHero icon={MonitorCheck} title={runStage} />;
  }

  if (phase === 'done') {
    return <DoneHero freed={freed} detail="ジャンク削除 ・ メモリ解放 ・ DNS 更新" onDone={() => setPhase('idle')} />;
  }

  return (
    <>
      <div className="hero centered" style={{ alignContent: 'center' }}>
        <div style={{ textAlign: 'center', animation: 'rise .5s both' }}>
          <div className="eyebrow">スキャン完了</div>
          <h1 style={{ margin: '0 0 28px' }}>おすすめの作業</h1>
        </div>
        <div className="summary-grid">
          <SumCard i={0} c={tint(moduleById('junk'), theme)} icon={Trash2} title="クリーンアップ" onMore={() => go('junk')}
            value={<BigBytesInline bytes={junkSize} />} text="削除できるジャンク" />
          <SumCard i={1} c={tint(moduleById('protection'), theme)} icon={ShieldCheck} title="保護" onMore={() => go('protection')}
            value={!defender?.available ? '確認不可' : protectOk ? '問題なし' : threats ? `脅威 ${threats} 件` : '要確認'}
            text={!defender?.available ? 'Defender を利用できません' : protectOk ? 'リアルタイム保護: 有効' : threats ? '脅威が検出されています' : 'リアルタイム保護: 無効'} />
          <SumCard i={2} c={tint(moduleById('optimize'), theme)} icon={CircleGauge} title="スピード" onMore={() => go('optimize')}
            value={<>2<small>件のタスク</small></>}
            text={`メモリ ${Math.round(memRatio * 100)}% 使用中 ・ 自動起動 ${enabledStartup} 個`} />
        </div>
      </div>
      <ScanDock label="実行" onClick={run} hint={<button className="btn ghost sm" onClick={() => setPhase('idle')}>キャンセル</button>} />
    </>
  );
}

function BigBytesInline({ bytes }: { bytes: number }) {
  const [n, u] = formatBytes(bytes).split(' ');
  return <>{n}<small>{u}</small></>;
}

function SumCard({ i, c, icon: Icon, title, value, text, onMore }: { i: number; c: string; icon: typeof Trash2; title: string; value: React.ReactNode; text: string; onMore: () => void }) {
  return (
    <div className="sum-card" style={{ '--c1': c, animationDelay: `${i * 60}ms` } as CSSProperties}>
      <div className="ic"><Icon size={24} /></div>
      <h3>{title}</h3>
      <div className="val">{value}</div>
      <p>{text}</p>
      <button className="btn ghost sm link" onClick={onMore}>詳細を確認 <ArrowRight size={14} /></button>
    </div>
  );
}

function StageChips({ stage }: { stage: number }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
      {STAGES.map((s, i) => (
        <span key={s.key} className={`chip ${i < stage ? 'ok' : i === stage ? 'accent' : ''}`} style={{ padding: '5px 12px', fontSize: 12 }}>
          {i < stage ? <CheckCircle2 size={13} /> : i === stage ? <Loader2 size={13} className="spin" /> : <Circle size={13} />}
          {s.label}
        </span>
      ))}
    </div>
  );
}
