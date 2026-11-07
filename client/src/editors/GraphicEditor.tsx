import { useRef, useState } from 'react';
import { COLORS, FONTS, graphicOps, type GElement, type GraphicDoc } from '@fls/shared';
import { useL, useT } from '../i18n';
import { sfx } from '../audio';
import type { EditorProps } from '../ui/Computer';

export function GraphicEditor({ doc: d, setDoc, help, zoom, guides, sloppy }: EditorProps) {
  const doc = d as GraphicDoc;
  const T = useT();
  const L = useL();
  const [sel, setSel] = useState<string | null>(null);
  const [guide, setGuide] = useState<{ v?: number; h?: number }>({});
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; o: GElement } | null>(null);
  const scale = Math.min(0.52, 520 / doc.height) * (0.9 + zoom * 0.1);
  const el = doc.elements.find((e) => e.id === sel);
  const set = (p: Partial<GElement>) => sel && setDoc(graphicOps.set(doc, sel, p));
  const down = (e: React.PointerEvent, x: GElement, mode: 'move' | 'resize') => {
    e.stopPropagation();
    setSel(x.id);
    drag.current = { id: x.id, mode, sx: e.clientX, sy: e.clientY, o: { ...x } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const dr = drag.current;
    if (!dr) return;
    const dx = (e.clientX - dr.sx) / scale * (document.dir === 'rtl' && false ? -1 : 1), dy = (e.clientY - dr.sy) / scale;
    if (dr.mode === 'move') {
      let x = Math.round(dr.o.x + dx), y = Math.round(dr.o.y + dy);
      const g: { v?: number; h?: number } = {};
      if (guides) {
        const cx = (doc.width - dr.o.w) / 2, cy = (doc.height - dr.o.h) / 2;
        if (Math.abs(x - cx) < 10) { x = Math.round(cx); g.v = doc.width / 2; }
        if (Math.abs(y - cy) < 10) { y = Math.round(cy); g.h = doc.height / 2; }
      }
      setGuide(g);
      setDoc(graphicOps.set(doc, dr.id, { x, y }));
    } else {
      setDoc(graphicOps.set(doc, dr.id, { w: Math.max(20, Math.round(dr.o.w + dx)), h: Math.max(20, Math.round(dr.o.h + dy)) }));
    }
  };
  const up = () => {
    if (drag.current && sloppy && Math.random() < 0.3) { const id = drag.current.id; const cur = doc.elements.find((x) => x.id === id)!; setDoc(graphicOps.set(doc, id, { x: cur.x + 12 })); }
    drag.current = null; setGuide({});
  };
  const align = (how: Parameters<typeof graphicOps.align>[2]) => { if (sel) { setDoc(graphicOps.align(doc, sel, how)); sfx('pop'); } };
  const sorted = [...doc.elements].sort((a, b) => a.z - b.z);
  return (
    <div className="ge" data-testid="graphic-editor">
      <div className="ge-tools">
        <h5>➕ {T('إضافة', 'Add')}</h5>
        <button className="btn tiny wide" onClick={() => { const nd = graphicOps.add(doc, 'text', T('نص جديد', 'New text')); setDoc(nd); setSel(nd.elements[nd.elements.length - 1].id); }}>🅣 {T('نص', 'Text')}</button>
        <button className="btn tiny wide" onClick={() => { const nd = graphicOps.add(doc, 'rect'); setDoc(nd); setSel(nd.elements[nd.elements.length - 1].id); }}>▭ {T('مستطيل', 'Rectangle')}</button>
        <button className="btn tiny wide" onClick={() => { const nd = graphicOps.add(doc, 'circle'); setDoc(nd); setSel(nd.elements[nd.elements.length - 1].id); }}>◯ {T('دائرة', 'Circle')}</button>
        <h5>🧱 {T('الطبقات', 'Layers')}</h5>
        {[...sorted].reverse().map((x) => <button key={x.id} className={`layer-btn ${sel === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>{L(x.label)}{x.content ? ` «${x.content.slice(0, 10)}»` : ''}</button>)}
      </div>
      <div className="ge-canvas-wrap" onPointerMove={move} onPointerUp={up} onClick={() => setSel(null)}>
        <div className="ge-artboard" style={{ width: doc.width * scale, height: doc.height * scale, background: doc.background }}>
          {sorted.map((x) => (
            <div key={x.id} data-el={x.id} className={`g-el k-${x.kind} ${sel === x.id ? 'sel' : ''}`} onPointerDown={(e) => down(e, x, 'move')} onClick={(e) => e.stopPropagation()}
              style={{ left: x.x * scale, top: x.y * scale, width: x.w * scale, height: x.h * scale, zIndex: x.z + 10, ...(x.kind === 'text' ? { color: x.color, fontFamily: x.font, fontSize: x.fontSize * scale } : x.kind === 'image' ? {} : { background: x.color }), ...(x.kind === 'rect' && x.content ? { color: '#fff', fontFamily: x.font, fontSize: x.fontSize * scale } : {}) }}>
              {x.kind === 'text' && x.content}
              {x.kind === 'rect' && x.content}
              {x.kind === 'image' && <div className="img-ph" style={{ background: `linear-gradient(135deg, ${x.color}, #e9eef5)` }}>🖼️</div>}
              {x.kind === 'logo' && <span className="logo-star">★</span>}
              {sel === x.id && <span className="handle" onPointerDown={(e) => down(e, x, 'resize')} />}
            </div>
          ))}
          {guide.v !== undefined && <div className="gguide v" style={{ left: guide.v * scale }} />}
          {guide.h !== undefined && <div className="gguide h" style={{ top: guide.h * scale }} />}
        </div>
        <div className="muted tiny">{doc.width}×{doc.height}px {guides ? `· ${T('خطوط محاذاة ذكية', 'smart guides')}` : ''}</div>
      </div>
      <div className="ge-props">
        {!el && (
          <>
            <h5>🎨 {T('الخلفية', 'Background')}</h5>
            <div className="swatches">{COLORS.map((c) => <button key={c.hex} title={L(c.name)} className={doc.background === c.hex ? 'on' : ''} style={{ background: c.hex }} onClick={() => setDoc({ ...doc, background: c.hex })} data-testid={`bg-${c.hex}`} />)}</div>
            <div className="muted tiny">{T('حدّد عنصرًا لتعديله', 'Select an element to edit it')}</div>
          </>
        )}
        {el && (
          <>
            <h5>⚙️ {L(el.label)}</h5>
            <div className="align-grid">
              <button className={`btn tiny ${help ? 'glowable' : ''}`} onClick={() => align('left')} title={T('محاذاة يسار', 'Align left')}>⇤</button>
              <button className="btn tiny" onClick={() => align('centerH')} title={T('توسيط أفقي', 'Center horizontally')} data-testid="align-centerH">↔ {T('توسيط', 'Center')}</button>
              <button className="btn tiny" onClick={() => align('right')} title={T('محاذاة يمين', 'Align right')}>⇥</button>
              <button className="btn tiny" onClick={() => align('top')} title={T('أعلى', 'Top')}>⤒</button>
              <button className="btn tiny" onClick={() => align('centerV')} title={T('توسيط عمودي', 'Center vertically')}>↕</button>
              <button className="btn tiny" onClick={() => align('bottom')} title={T('أسفل', 'Bottom')}>⤓</button>
            </div>
            <div className="row">
              {(['x', 'y', 'w', 'h'] as const).map((k) => <label key={k} className="mini">{k.toUpperCase()}<input type="number" value={Math.round(el[k])} onChange={(e) => set({ [k]: Number(e.target.value) })} /></label>)}
            </div>
            {(el.kind === 'text' || el.content) && (
              <>
                <label>{T('النص', 'Text')}<input value={el.content} onChange={(e) => set({ content: e.target.value })} /></label>
                <label>{T('الخط', 'Font')}<select value={el.font} onChange={(e) => set({ font: e.target.value })}>{FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}</select></label>
                <label>{T('حجم الخط', 'Font size')}<input type="number" value={el.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} /></label>
              </>
            )}
            <span className="lbl">{T('اللون', 'Color')}</span>
            <div className="swatches">{COLORS.map((c) => <button key={c.hex} title={L(c.name)} className={el.color === c.hex ? 'on' : ''} style={{ background: c.hex }} onClick={() => set({ color: c.hex })} />)}</div>
            <div className="row">
              <button className="btn tiny" onClick={() => setDoc(graphicOps.layer(doc, el.id, 1))}>⬆ {T('للأمام', 'Forward')}</button>
              <button className="btn tiny" onClick={() => setDoc(graphicOps.layer(doc, el.id, -1))}>⬇ {T('للخلف', 'Backward')}</button>
              {!['headline', 'photo', 'logo', 'cta'].includes(el.id) && <button className="btn tiny" onClick={() => { setDoc(graphicOps.remove(doc, el.id)); setSel(null); }}>🗑</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
