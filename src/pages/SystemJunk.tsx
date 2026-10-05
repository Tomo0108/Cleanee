import { useEffect, useMemo, useState } from 'react';
import { Trash2, HardDrive } from 'lucide-react';
import { api } from '../api';
import type { CleanResult, JunkCategory, JunkProgress } from '../api/types';
import { useApp } from '../App';
import { HELP } from '../help';
import { formatBytes, formatNumber } from '../lib/format';
import { IdleHero, ScanningHero, ScanDock, PageHead, Checkbox, useProgress, useToast } from '../components/ui';
import { JunkList, AdminNotice, DoneHero } from '../components/Results';

type Phase = 'idle' | 'scanning' | 'results' | 'cleaning' | 'done';

export default function SystemJunk() {
  const { setBadge, refreshSys, sys, recordFreed } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [cats, setCats] = useState<JunkCategory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [prog, setProg] = useState<JunkProgress>({ category: '', total: 0 });
  const [cleanProg, setCleanProg] = useState(0);
  const [result, setResult] = useState<CleanResult | null>(null);

  useProgress<JunkProgress>('junk', setProg);
  useProgress<{ index: number; count: number }>('junk-clean', (d) => setCleanProg(d.index / d.count));

  const scan = async () => {
    setPhase('scanning');
    setProg({ category: '', total: 0 });
    setBadge('junk', { busy: true });
    const r = await api.junkScan();
    if (!r.length) { setPhase('idle'); setBadge('junk', null); return; }
    setCats(r);
    setExcluded(new Set());
    setSelected(new Set(r.filter((c) => c.selected && c.size > 0).map((c) => c.id)));
    setPhase('results');
  };

  const clean = async () => {
    setPhase('cleaning');
    setCleanProg(0);
    setBadge('junk', { busy: true });
    const r = await api.junkClean([...selected], [...excluded]);
    setResult(r);
    setPhase('done');
    setBadge('junk', null);
    recordFreed(r.freed);
    refreshSys();
    if (r.failed) toast(`使用中の ${formatNumber(r.failed)} 個のファイルはスキップしました`, 'info');
  };

  const total = useMemo(() => cats.reduce((a, c) => a + c.size, 0), [cats]);
  const selSize = useMemo(() => cats.filter((c) => selected.has(c.id)).reduce(
    (a, c) => a + c.size - c.items.filter((it) => excluded.has(it.path)).reduce((x, it) => x + it.size, 0), 0,
  ), [cats, selected, excluded]);

  useEffect(() => {
    if (phase === 'results') setBadge('junk', { text: formatBytes(selSize) });
  }, [phase, selSize, setBadge]);

  if (phase === 'idle') {
    const d = sys?.drives[0];
    return (
      <>
        <IdleHero
          icon={Trash2} title="システムジャンク" tagline={HELP.junk.tagline} onActivate={scan}
          extra={d && <span className="stat-pill"><HardDrive size={14} /><b>{formatBytes(d.free)}</b> 空き</span>}
        />
        <ScanDock onClick={scan} />
      </>
    );
  }

  if (phase === 'scanning') {
    return (
      <>
        <ScanningHero icon={Trash2} title="ジャンクを探しています" bytes={prog.total} path={prog.current} />
        <ScanDock label="停止" ghost onClick={() => api.cancel('junk')} />
      </>
    );
  }

  if (phase === 'cleaning') {
    return <ScanningHero icon={Trash2} title="クリーンアップ中" bytes={selSize * cleanProg} progress={cleanProg} />;
  }

  if (phase === 'done' && result) {
    return <DoneHero freed={result.freed} detail={`${formatNumber(result.removed)} 個のファイルを削除`} onDone={() => { setPhase('idle'); setCats([]); }} />;
  }

  const allSel = cats.filter((c) => c.size > 0).every((c) => selected.has(c.id));
  return (
    <>
      <PageHead icon={Trash2} title="システムジャンク" sub={`${formatBytes(total)} 見つかりました`}>
        <button className="btn ghost" onClick={scan}>再スキャン</button>
      </PageHead>
      <AdminNotice />
      <div className="glass-scroll">
        <JunkList
          cats={cats} selected={selected} adminMissing={!!sys && !sys.admin}
          excluded={excluded}
          onExclude={(p, v) => setExcluded((s) => { const n = new Set(s); v ? n.add(p) : n.delete(p); return n; })}
          onToggle={(id, v) => setSelected((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; })}
        />
      </div>
      <div className="footer-bar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <Checkbox checked={allSel} indeterminate={selected.size > 0} onChange={(v) => setSelected(v ? new Set(cats.filter((c) => c.size > 0).map((c) => c.id)) : new Set())} />
          <span className="muted">すべて選択</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div className="sum"><b>{formatBytes(selSize)}</b></div>
          <button className="btn primary pill big" disabled={!selected.size} onClick={clean}>クリーンアップ</button>
        </div>
      </div>
    </>
  );
}
