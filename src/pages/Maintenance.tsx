import { useState } from 'react';
import { Info, Wrench, MemoryStick, Network, Images, RotateCcw, LifeBuoy, HardDrive, FileCheck2, Layers3, PackageCheck, ScanSearch, CheckCircle2, AlertCircle, Loader2, ShieldAlert, type LucideIcon } from 'lucide-react';
import { api } from '../api';
import type { TaskResult } from '../api/types';
import { useApp } from '../App';
import { formatBytes } from '../lib/format';
import { PageHead, Checkbox, useToast, ActionButton } from '../components/ui';

interface Task { id: string; name: string; desc: string; icon: LucideIcon; elevated?: boolean; rec?: boolean }
const TASKS: Task[] = [
  { id: 'freeRam', name: 'メモリを解放', desc: '各プロセスの未使用メモリを解放して空きメモリを増やします', icon: MemoryStick, rec: true },
  { id: 'flushDns', name: 'DNS キャッシュを消去', desc: 'Web サイトに接続できない・表示が古い問題を解消します', icon: Network, rec: true },
  { id: 'rebuildThumbs', name: 'サムネイルとアイコンの再構築', desc: '画像のサムネイルやアイコンが正しく表示されない問題を修正します', icon: Images },
  { id: 'restartExplorer', name: 'エクスプローラーを再起動', desc: 'タスクバーやデスクトップの不具合をリフレッシュします', icon: RotateCcw },
  { id: 'restorePoint', name: '復元ポイントを作成', desc: '大きな変更の前に、システムを元に戻せる状態を保存します', icon: LifeBuoy, elevated: true },
  { id: 'trim', name: 'ドライブの最適化 (TRIM)', desc: 'SSD のパフォーマンスを維持するために TRIM を実行します', icon: HardDrive, elevated: true },
  { id: 'sfc', name: 'システムファイルの検査', desc: '破損した Windows のシステムファイルを検出・修復します (sfc)', icon: FileCheck2, elevated: true },
  { id: 'dism', name: 'Windows イメージの修復', desc: 'コンポーネントストアの破損を修復します (DISM)', icon: Layers3, elevated: true },
  { id: 'componentCleanup', name: 'コンポーネントストアの整理', desc: '置き換えられた古い更新プログラムを削除して容量を確保します', icon: PackageCheck, elevated: true },
  { id: 'chkdsk', name: 'ディスクのエラーチェック', desc: 'ファイルシステムのエラーをオンラインでスキャンします', icon: ScanSearch, elevated: true },
];

type State = { status: 'running' | 'done' | 'error'; result?: TaskResult };

export default function Maintenance() {
  const { refreshSys, setBadge, recordFreed } = useApp();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(TASKS.filter((t) => t.rec).map((t) => t.id)));
  const [states, setStates] = useState<Record<string, State>>({});
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setBadge('maintenance', { busy: true });
    const ids = TASKS.filter((t) => selected.has(t.id)).map((t) => t.id);
    setStates((s) => { const n = { ...s }; ids.forEach((id) => delete n[id]); return n; });
    let diskFreed = 0;
    for (const id of ids) {
      setStates((s) => ({ ...s, [id]: { status: 'running' } }));
      const r = await api.runTask(id);
      if (id !== 'freeRam' && r.freed) diskFreed += r.freed;
      setStates((s) => ({ ...s, [id]: { status: r.ok ? 'done' : 'error', result: r } }));
    }
    setRunning(false);
    setBadge('maintenance', null);
    refreshSys();
    recordFreed(diskFreed);
    toast(`${ids.length} 件のタスクを実行しました`);
  };

  const toggle = (id: string) => !running && setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <PageHead icon={Wrench} title="メンテナンス">
        <button className="btn ghost" onClick={() => setSelected(new Set(TASKS.filter((t) => t.rec).map((t) => t.id)))} disabled={running}>おすすめを選択</button>
      </PageHead>
      <div className="glass-scroll">
        <div className="task-grid">
          {TASKS.map((t, i) => {
            const st = states[t.id];
            return (
              <div key={t.id} className={`task ${selected.has(t.id) ? 'sel' : ''}`} style={{ animationDelay: `${i * 35}ms` }} onClick={() => toggle(t.id)}>
                <Checkbox checked={selected.has(t.id)} disabled={running} onChange={() => toggle(t.id)} />
                <div className="ti"><t.icon size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4>
                    {t.name}
                    <span className="info" data-tip={t.desc}><Info size={13} /></span>
                  </h4>
                  <div className="task-chips">
                    {t.rec && <span className="chip accent">おすすめ</span>}
                    {t.elevated && <span className="chip warn" data-tip="UAC の確認後、別ウィンドウで実行"><ShieldAlert size={11} />管理者</span>}
                  </div>
                  {st && (
                    <div className={`res ${st.status === 'done' ? 'ok' : st.status === 'error' ? 'err' : ''}`}>
                      {st.status === 'running' ? <Loader2 size={13} className="spin" /> : st.status === 'done' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {st.status === 'running' ? '実行中…' : st.result?.message}
                      {st.result?.freed ? ` (${formatBytes(st.result.freed)})` : ''}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="footer-bar">
        <span className="muted">{selected.size} 件選択</span>
        <ActionButton disabled={!selected.size} busy={running} busyLabel="実行中" onClick={run}>実行</ActionButton>
      </div>
    </>
  );
}
