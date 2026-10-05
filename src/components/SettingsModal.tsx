import { FolderPlus, X, Settings2, HardDrive } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../App';
import logo from '../assets/logo.png';
import { formatBytes, formatDate, prettyPath } from '../lib/format';
import { Modal, Toggle, Segmented } from './ui';

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div style={{ flex: 1 }}>
        <div className="set-title">{title}</div>
        {sub && <div className="set-sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="set-group">
      <div className="nav-label">{label}</div>
      <div className="set-group-box">{children}</div>
    </div>
  );
}

const MOD = navigator.platform.toLowerCase().startsWith('mac') ? '⌘' : 'Ctrl';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings: s, updateSettings } = useApp();
  if (!s) return null;

  const addExclude = async () => {
    const picked = await api.pickFolders();
    if (picked.length) updateSettings({ excludes: [...new Set([...s.excludes, ...picked])] });
  };

  return (
    <Modal onClose={onClose} wide actions={<button className="btn primary" onClick={onClose}>完了</button>}>
      <div className="set-header">
        <span className="help-icon"><Settings2 size={18} /></span>
        <h3 style={{ margin: 0 }}>設定</h3>
      </div>

      <div className="stat-hero">
        <HardDrive size={18} />
        <div>
          <div className="set-sub">これまでに解放した容量</div>
          <b>{formatBytes(s.totalFreed)}</b>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="set-sub">実行回数</div>
          <b>{s.cleanCount} 回</b>
        </div>
        {s.lastClean > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div className="set-sub">前回</div>
            <b>{formatDate(s.lastClean)}</b>
          </div>
        )}
      </div>

      <Group label="外観">
        <Row title="テーマ" sub="システム: Windows の設定に合わせます">
          <Segmented
            value={s.theme || 'system'}
            onChange={(v) => updateSettings({ theme: v })}
            options={[{ value: 'system', label: 'システム' }, { value: 'light', label: 'ライト' }, { value: 'dark', label: 'ダーク' }]}
          />
        </Row>
        <Row title="アニメーション" sub="自動: Windows の「アニメーション効果」に従います">
          <Segmented
            value={s.motion || 'auto'}
            onChange={(v) => updateSettings({ motion: v })}
            options={[{ value: 'auto', label: '自動' }, { value: 'on', label: 'オン' }, { value: 'off', label: 'オフ' }]}
          />
        </Row>
      </Group>

      <Group label="一般">
        <Row title="通知領域に常駐" sub="ウィンドウを閉じてもトレイから操作できます">
          <Toggle on={s.trayEnabled} onChange={(v) => updateSettings({ trayEnabled: v })} />
        </Row>
        <Row title="Windows の起動時に開始" sub="通知領域に常駐した状態で起動します">
          <Toggle on={s.launchAtLogin} onChange={(v) => updateSettings({ launchAtLogin: v })} />
        </Row>
        <Row title="空き容量の通知" sub="C: ドライブの空きが 10% を下回ったら通知します">
          <Toggle on={s.lowDiskAlert} onChange={(v) => updateSettings({ lowDiskAlert: v })} />
        </Row>
      </Group>

      <Group label="クリーンアップ">
        <Row title="一時ファイルの保持期間" sub="これより新しいファイルは削除しません">
          <Segmented
            value={String(s.tempAgeHours)}
            onChange={(v) => updateSettings({ tempAgeHours: Number(v) })}
            options={[{ value: '6', label: '6 時間' }, { value: '24', label: '1 日' }, { value: '72', label: '3 日' }, { value: '168', label: '7 日' }]}
          />
        </Row>
        <Row title="除外フォルダ" sub="すべてのスキャンで対象外にします">
          <button className="btn sm" onClick={addExclude}><FolderPlus size={14} />追加</button>
        </Row>
        {s.excludes.length > 0 && (
          <div className="exclude-list">
            {s.excludes.map((e) => (
              <span key={e} className="chip" style={{ padding: '1px 3px 1px 9px', fontSize: 12 }}>
                <span className="mono">{prettyPath(e)}</span>
                <button className="icon-btn" style={{ width: 18, height: 18 }} aria-label="除外を解除" onClick={() => updateSettings({ excludes: s.excludes.filter((x) => x !== e) })}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </Group>

      <Group label="キーボードショートカット">
        <Row title="機能の切り替え"><span><span className="kbd">{MOD}</span> + <span className="kbd">1</span>〜<span className="kbd">9</span></span></Row>
        <Row title="設定を開く"><span><span className="kbd">{MOD}</span> + <span className="kbd">,</span></span></Row>
        <Row title="ヘルプ"><span className="kbd">F1</span></Row>
      </Group>

      <div className="about">
        <img src={logo} alt="" />
        <div>
          <b>Cleanee</b> <span>バージョン {api.env.version}{api.demo ? '（デモ）' : ''}</span>
          <div>© 2026 Cleanee</div>
        </div>
      </div>
    </Modal>
  );
}
