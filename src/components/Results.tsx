import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, CheckCircle2, ShieldAlert, FolderOpen, Info } from 'lucide-react';
import type { JunkCategory } from '../api/types';
import { api } from '../api';
import { useApp } from '../App';
import { formatBytes, formatNumber } from '../lib/format';
import { categoryIcon, categoryColor } from '../lib/icons';
import { Checkbox, Orb, BigBytes, ScanDock } from './ui';

export function JunkList({ cats, selected, onToggle, adminMissing, excluded, onExclude }: {
  cats: JunkCategory[]; selected: Set<string>; onToggle: (id: string, v: boolean) => void; adminMissing: boolean;
  excluded?: Set<string>; onExclude?: (path: string, excluded: boolean) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="cat-list">
      {cats.map((c, i) => {
        const Icon = categoryIcon(c.icon);
        const empty = c.size === 0;
        const exCount = c.items.filter((it) => excluded?.has(it.path)).length;
        return (
          <div key={c.id} className={`cat ${open === c.id ? 'open' : ''} ${empty ? 'empty' : ''}`} style={{ animationDelay: `${i * 35}ms` }}>
            <div className="cat-row" onClick={() => c.items.length && setOpen(open === c.id ? null : c.id)}>
              <Checkbox checked={selected.has(c.id)} disabled={empty} onChange={(v) => onToggle(c.id, v)} />
              <div className="cat-icon" style={{ '--k': categoryColor(c.icon) } as CSSProperties}><Icon size={17} /></div>
              <div className="cat-main">
                <div className="cat-name">
                  {c.name}
                  <span className="info" data-tip={c.desc}><Info size={13} /></span>
                  {c.admin && adminMissing && <span className="chip warn" data-tip="管理者として実行すると完全に削除できます"><ShieldAlert size={11} />管理者</span>}
                  {exCount > 0 && <span className="chip">{exCount} 件除外</span>}
                </div>
              </div>
              <div className="cat-size">
                {empty ? <span className="faint" style={{ fontSize: 13, fontWeight: 500 }}>—</span> : formatBytes(c.size)}
                {!empty && <small>{formatNumber(c.count)} 項目</small>}
              </div>
              <ChevronRight size={18} className="chev" style={{ visibility: c.items.length ? 'visible' : 'hidden' }} />
            </div>
            {open === c.id && (
              <div className="cat-items">
                {c.items.map((it) => {
                  const ex = !!excluded?.has(it.path);
                  return (
                    <label className={`cat-item ${ex ? 'ex' : ''}`} key={it.path}>
                      {onExclude && <Checkbox checked={!ex} onChange={(v) => onExclude(it.path, !v)} />}
                      <span className="p" title={it.path}>{`\u200E${it.path}`}</span>
                      <span className="s">{formatBytes(it.size)}</span>
                      <button className="icon-btn row-action" style={{ width: 26, height: 26 }} aria-label="場所を表示" onClick={(e) => { e.preventDefault(); api.reveal(it.path); }}><FolderOpen size={14} /></button>
                    </label>
                  );
                })}
                {c.count > c.items.length && <div className="faint" style={{ fontSize: 12, padding: '6px 6px 0' }}>ほか {formatNumber(c.count - c.items.length)} 項目</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AdminNotice({ text = '一部の項目は管理者権限で完全に削除できます' }: { text?: string }) {
  const { sys } = useApp();
  if (!sys || sys.admin || api.demo) return null;
  return (
    <div className="notice">
      <ShieldAlert size={18} />
      <span>{text}</span>
      <button className="btn sm" onClick={() => api.relaunchAdmin()}>管理者として再起動</button>
    </div>
  );
}

export function DoneHero({ freed, title = 'を解放しました', detail, onDone, doneLabel = '完了', extra }: {
  freed?: number; title?: string; detail?: ReactNode; onDone: () => void; doneLabel?: string; extra?: ReactNode;
}) {
  return (
    <>
      <div className="hero centered">
        <div className="hero-art" style={{ minHeight: 0 }}><Orb icon={CheckCircle2} small /></div>
        <div className="scan-status" style={{ animation: 'rise .6s cubic-bezier(.2,.8,.2,1) both' }}>
          {freed !== undefined ? <BigBytes bytes={freed} suffix={` ${title}`} /> : <div className="big" style={{ fontSize: 34 }}>{title}</div>}
          {detail && <div className="muted" style={{ marginTop: 8 }}>{detail}</div>}
          {extra}
        </div>
      </div>
      <ScanDock label={doneLabel} ghost onClick={onDone} />
    </>
  );
}
