import { useEffect, useRef, useState } from 'react';
import { CircleHelp, Lightbulb, X } from 'lucide-react';
import { HELP } from '../help';
import { moduleById, type ModuleId } from '../modules';

/** "?" button in the title bar that opens the current module's explanation. */
export function HelpButton({ module }: { module: ModuleId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [module]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', click);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', click); };
  }, []);

  const m = moduleById(module);
  const h = HELP[module];
  return (
    <div className="help-wrap no-drag" ref={ref}>
      <button className={`help-btn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="ヘルプ (F1)">
        <CircleHelp size={15} />ヘルプ
      </button>
      {open && (
        <div className="help-panel">
          <div className="help-head">
            <span className="help-icon"><m.icon size={20} /></span>
            <div style={{ flex: 1 }}>
              <div className="help-title">{m.title}</div>
              <div className="help-tag">{h.tagline}</div>
            </div>
            <button className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <p className="help-lead">{h.lead}</p>
          <ul className="help-features">
            {h.features.map((f) => (
              <li key={f.title}>
                <span className="hf-icon"><f.icon size={16} /></span>
                <div><b>{f.title}</b><span>{f.text}</span></div>
              </li>
            ))}
          </ul>
          {h.tips && (
            <div className="help-tips">
              {h.tips.map((t) => <div key={t}><Lightbulb size={14} />{t}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
