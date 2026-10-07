import { useMemo, useState } from 'react';
import { Fingerprint, Globe, Monitor, AlertTriangle, Info } from 'lucide-react';
import { HELP } from '../help';
import { api } from '../api';
import type { CleanResult, PrivacyGroup } from '../api/types';
import { useApp } from '../App';
import { formatBytes } from '../lib/format';
import { IdleHero, ScanningHero, ScanDock, PageHead, Checkbox, useToast, ActionButton } from '../components/ui';
import { DoneHero } from '../components/Results';

type Phase = 'idle' | 'scanning' | 'results' | 'cleaning' | 'done';

export default function Privacy() {
  const { setBadge, recordFreed } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [groups, setGroups] = useState<PrivacyGroup[]>([]);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CleanResult | null>(null);

  const scan = async () => {
    setPhase('scanning');
    setBadge('privacy', { busy: true });
    const g = await api.privacyScan();
    setGroups(g);
    setActive(0);
    setSelected(new Set(g.filter((x) => !x.running).flatMap((x) => x.traces.filter((t) => t.selected).map((t) => t.id))));
    setPhase('results');
    setBadge('privacy', null);
  };

  const clean = async () => {
    setPhase('cleaning');
    const r = await api.privacyClean([...selected]);
    setResult(r);
    recordFreed(r.freed);
    setPhase('done');
    if (r.failed) toast(`${r.failed} 個のファイルは使用中のため削除できませんでした`, 'info');
  };

  const count = selected.size;
  const selSize = useMemo(() => groups.flatMap((g) => g.traces).filter((t) => selected.has(t.id)).reduce((a, t) => a + t.size, 0), [groups, selected]);
  const toggle = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });

  if (phase === 'idle') {
    return (
      <>
        <IdleHero icon={Fingerprint} title="プライバシー" tagline={HELP.privacy.tagline} onActivate={scan} />
        <ScanDock onClick={scan} />
      </>
    );
  }
  if (phase === 'scanning') return <ScanningHero icon={Fingerprint} title="痕跡を探しています" />;
  if (phase === 'cleaning') return <ScanningHero icon={Fingerprint} title="消去中" />;
  if (phase === 'done' && result) {
    return <DoneHero title="痕跡を消去しました" detail={`${result.removed} 項目 ・ ${formatBytes(result.freed)}`} onDone={() => setPhase('idle')} />;
  }

  const g = groups[active];
  return (
    <>
      <PageHead icon={Fingerprint} title="プライバシー" sub={`${groups.reduce((a, g) => a + g.traces.length, 0)} 種類の痕跡`}>
        <button className="btn ghost" onClick={scan}>再スキャン</button>
      </PageHead>
      <div className="split">
        <div className="side-list">
          {groups.map((x, i) => {
            const n = x.traces.filter((t) => selected.has(t.id)).length;
            return (
              <button key={x.name} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
                {x.name === 'Windows' ? <Monitor size={17} /> : <Globe size={17} />}
                <span className="ellipsis">{x.name}</span>
                <span className="n">{n ? `${n} 件` : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="glass-scroll" style={{ marginRight: -12 }}>
          {g?.running && (
            <div className="notice">
              <AlertTriangle size={18} />
              <span>{g.name} を終了してから再スキャンしてください</span>
              <button className="btn sm" onClick={scan}>再スキャン</button>
            </div>
          )}
          <div className="rows">
            {g?.traces.map((t, i) => (
              <label key={t.id} className={`row ${selected.has(t.id) ? 'sel' : ''}`} style={{ cursor: g.running ? 'not-allowed' : 'pointer', opacity: g.running ? 0.5 : 1, animation: `rise .4s ${i * 40}ms both` }}>
                <Checkbox checked={selected.has(t.id)} disabled={g.running} onChange={(v) => toggle(t.id, v)} />
                <div className="grow">
                  <div className="t">{t.name} <span className="info" data-tip={t.desc}><Info size={13} /></span></div>
                </div>
                <div className="num">{t.special ? '—' : formatBytes(t.size)}</div>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="footer-bar">
        <span className="muted">{count} 項目</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div className="sum"><b>{formatBytes(selSize)}</b></div>
          <ActionButton disabled={!count} onClick={clean}>消去する</ActionButton>
        </div>
      </div>
    </>
  );
}
