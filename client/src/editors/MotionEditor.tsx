import { useEffect, useRef, useState } from 'react';
import { COLORS, EASE_NAMES, EASES, evalProp, motionOps, MPROPS, PROP_NAMES, sortedKeys, type Ease, type MLayer, type MotionDoc, type MProp } from '@fls/shared';
import { useL, useT } from '../i18n';
import { sfx } from '../audio';
import type { EditorProps } from '../ui/Computer';

const r2 = (v: number) => Math.round(v * 100) / 100;

export function MotionEditor({ doc: d, setDoc, reqs, help, zoom, sloppy }: EditorProps) {
  const doc = d as MotionDoc;
  const T = useT();
  const L = useL();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selLayer, setSelLayer] = useState<string>(doc.layers[0]?.id);
  const [selKey, setSelKey] = useState<{ prop: MProp; t: number } | null>(null);
  const [autoKey, setAutoKey] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; ox: number; oy: number; sx: number; sy: number } | null>(null);
  const layer = doc.layers.find((x) => x.id === selLayer);
  const scale = 0.62 + (zoom - 1) * 0.08;
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => { setT((x) => { const n = x + (now - last) / 1000; if (n >= doc.duration) { setPlaying(false); return doc.duration; } return n; }); last = now; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, doc.duration]);

  const jitter = (v: number, prop: MProp) => (sloppy && Math.random() < 0.3 ? v + (prop === 'x' || prop === 'y' ? (Math.random() - 0.5) * 60 : (Math.random() - 0.5) * 0.3) : v);
  const setKey = (prop: MProp, v: number, ease?: Ease) => { setDoc(motionOps.setKey(doc, selLayer, prop, r2(t), jitter(v, prop), ease)); sfx('pop'); };
  const setValue = (prop: MProp, v: number) => {
    if (!layer) return;
    if (autoKey || (layer.keys[prop]?.length ?? 0) > 0) setKey(prop, v);
    else setDoc(motionOps.setBase(doc, selLayer, prop, v));
  };

  const onDown = (e: React.PointerEvent, ly: MLayer) => {
    e.stopPropagation();
    setSelLayer(ly.id);
    drag.current = { id: ly.id, ox: evalProp(ly, 'x', t), oy: evalProp(ly, 'y', t), sx: e.clientX, sy: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const dr = drag.current;
    if (!dr || !stageRef.current) return;
    const nx = Math.round(dr.ox + (e.clientX - dr.sx) / scale), ny = Math.round(dr.oy + (e.clientY - dr.sy) / scale);
    stageRef.current.querySelector<HTMLElement>(`[data-layer="${dr.id}"]`)!.style.transform = `translate(-50%,-50%) translate(${(nx - dr.ox) * scale}px, ${(ny - dr.oy) * scale}px)`;
    (dr as any).nx = nx; (dr as any).ny = ny;
  };
  const onUp = () => {
    const dr = drag.current as any;
    drag.current = null;
    if (!dr) return;
    const el = stageRef.current?.querySelector<HTMLElement>(`[data-layer="${dr.id}"]`);
    if (el) el.style.transform = '';
    if (dr.nx === undefined) return;
    let nd = doc;
    const ly = doc.layers.find((x) => x.id === dr.id)!;
    for (const [prop, v] of [['x', dr.nx], ['y', dr.ny]] as [MProp, number][]) {
      if (autoKey || (ly.keys[prop]?.length ?? 0) > 0) nd = motionOps.setKey(nd, dr.id, prop, r2(t), v);
      else nd = motionOps.setBase(nd, dr.id, prop, v);
    }
    setDoc(nd);
  };
  const helpTimes = help ? [...new Set(reqs.flatMap((r) => [r.params.t1, r.params.t2]).filter((x) => typeof x === 'number'))] : [];
  const pps = 90 * zoom;

  return (
    <div className="me" data-testid="motion-editor">
      <div className="me-top">
        <div className="me-layers">
          <h5>🧱 {T('الطبقات', 'Layers')}</h5>
          {doc.layers.map((ly) => <button key={ly.id} className={`layer-btn ${selLayer === ly.id ? 'on' : ''}`} onClick={() => setSelLayer(ly.id)}><span className="sw" style={{ background: ly.color }} />{L(ly.label)}</button>)}
          <label className="chk"><input type="checkbox" checked={autoKey} onChange={(e) => setAutoKey(e.target.checked)} /> {T('مفتاح تلقائي عند التحريك', 'Auto-key on change')}</label>
        </div>
        <div className="me-stage-wrap">
          <div className="me-stage" ref={stageRef} style={{ width: doc.width * scale, height: doc.height * scale, background: doc.bg }} onPointerMove={onMove} onPointerUp={onUp}>
            <div className="safe" />
            {doc.layers.map((ly) => {
              const x = evalProp(ly, 'x', t), y = evalProp(ly, 'y', t), op = evalProp(ly, 'opacity', t), sc = evalProp(ly, 'scale', t), rot = evalProp(ly, 'rotation', t);
              return (
                <div key={ly.id} data-layer={ly.id} className={`m-layer k-${ly.kind} ${selLayer === ly.id ? 'sel' : ''}`} onPointerDown={(e) => onDown(e, ly)}
                  style={{ left: x * scale, top: y * scale, opacity: Math.max(0.05, op), color: ly.color, ['--s' as any]: sc, ['--r' as any]: `${rot}deg`, fontSize: 44 * scale, ['--c' as any]: ly.color }}>
                  <div className="inner" style={{ transform: `scale(${sc}) rotate(${rot}deg)` }}>
                    {ly.kind === 'text' ? ly.content : ly.kind === 'logo' ? <div className="logo-mark" style={{ background: ly.color }}>★</div> : <div className="rect" style={{ background: ly.color }} />}
                  </div>
                  {op < 0.06 && <span className="ghost-tag">{T('مخفي', 'hidden')}</span>}
                </div>
              );
            })}
          </div>
          <div className="transport">
            <button className="btn small" onClick={() => { if (t >= doc.duration) setT(0); setPlaying(!playing); }}>{playing ? '⏸' : '▶'}</button>
            <input type="range" min={0} max={doc.duration} step={0.05} value={t} onChange={(e) => setT(Number(e.target.value))} />
            <input type="number" min={0} max={doc.duration} step={0.5} value={r2(t)} onChange={(e) => setT(Math.max(0, Math.min(doc.duration, Number(e.target.value))))} data-testid="motion-time" />
            <span className="tc">{r2(t).toFixed(2)}s</span>
          </div>
        </div>
        <div className="me-props">
          <h5>⚙️ {layer ? L(layer.label) : ''}</h5>
          {layer && MPROPS.map((prop) => {
            const v = evalProp(layer, prop, t);
            const hasKeyHere = (layer.keys[prop] ?? []).some((k) => Math.abs(k.t - t) < 0.02);
            const step = prop === 'opacity' || prop === 'scale' ? 0.05 : prop === 'rotation' ? 15 : 10;
            return (
              <div className="prop-row" key={prop}>
                <span>{L(PROP_NAMES[prop])}</span>
                <input type="number" step={step} value={r2(v)} onChange={(e) => setValue(prop, Number(e.target.value))} data-testid={`prop-${prop}`} />
                <button className={`kf ${hasKeyHere ? 'on' : ''}`} title={T('إضافة/تحديث مفتاح هنا', 'Add/update key here')} onClick={() => setKey(prop, v)} data-testid={`key-${prop}`}>◆</button>
              </div>
            );
          })}
          {layer && (
            <>
              <span className="lbl">{T('اللون', 'Color')}</span>
              <div className="swatches">{COLORS.map((c) => <button key={c.hex} title={L(c.name)} className={layer.color === c.hex ? 'on' : ''} style={{ background: c.hex }} onClick={() => setDoc(motionOps.setLayer(doc, layer.id, { color: c.hex }))} />)}</div>
            </>
          )}
          {selKey && layer && (() => {
            const k = (layer.keys[selKey.prop] ?? []).find((x) => Math.abs(x.t - selKey.t) < 0.02);
            if (!k) return null;
            return (
              <div className="key-panel">
                <b>◆ {L(PROP_NAMES[selKey.prop])} @ {k.t}s = {r2(k.v)}</b>
                <label>{T('منحنى الحركة', 'Easing curve')}<select value={k.ease} onChange={(e) => setDoc(motionOps.setKey(doc, layer.id, selKey.prop, k.t, k.v, e.target.value as Ease))} data-testid="ease-select">{EASES.map((x) => <option key={x} value={x}>{L(EASE_NAMES[x])}</option>)}</select></label>
                <EaseCurve ease={k.ease} />
                <button className="btn tiny" onClick={() => { setDoc(motionOps.removeKey(doc, layer.id, selKey.prop, k.t)); setSelKey(null); }}>🗑 {T('حذف المفتاح', 'Delete key')}</button>
              </div>
            );
          })()}
        </div>
      </div>
      <div className="me-timeline" dir="ltr">
        <div className="mt-inner" style={{ width: doc.duration * pps + 160 }} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left - 150; if (x >= 0) setT(Math.max(0, Math.min(doc.duration, Math.round(x / pps / 0.05) * 0.05))); }}>
          <div className="ruler">{Array.from({ length: doc.duration * 2 + 1 }).map((_, i) => <span key={i} style={{ left: 150 + i * 0.5 * pps }}>{i % 2 === 0 ? `${i / 2}s` : '·'}</span>)}</div>
          {helpTimes.map((ht) => <div key={ht} className="help-line" style={{ left: 150 + ht * pps }} />)}
          {doc.layers.map((ly) => (
            <div key={ly.id} className={`mt-layer ${selLayer === ly.id ? 'sel' : ''}`}>
              {MPROPS.filter((p) => (ly.keys[p]?.length ?? 0) > 0 || (selLayer === ly.id)).map((prop) => (
                <div key={prop} className="mt-row">
                  <span className="mt-name">{L(ly.label)} · {L(PROP_NAMES[prop]).split(' ')[0]} {prop === 'x' || prop === 'y' ? prop.toUpperCase() : ''}</span>
                  {sortedKeys(ly, prop).map((k) => (
                    <button key={k.t} className={`diamond ${selKey && selKey.prop === prop && selLayer === ly.id && Math.abs(selKey.t - k.t) < 0.02 ? 'sel' : ''} e-${k.ease}`} style={{ left: 150 + k.t * pps }}
                      onClick={(e) => { e.stopPropagation(); setSelLayer(ly.id); setSelKey({ prop, t: k.t }); setT(k.t); }} title={`${k.t}s = ${r2(k.v)} (${k.ease})`}>◆</button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div className="playhead" style={{ left: 150 + t * pps }} />
        </div>
      </div>
    </div>
  );
}

function EaseCurve({ ease }: { ease: Ease }) {
  const pts: string[] = [];
  const f = (u: number) => { switch (ease) { case 'easeIn': return u ** 3; case 'easeOut': return 1 - (1 - u) ** 3; case 'easeInOut': return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2; case 'back': { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2; } default: return u; } };
  for (let i = 0; i <= 30; i++) { const u = i / 30; pts.push(`${4 + u * 92},${86 - f(u) * 72}`); }
  return <svg viewBox="0 0 100 100" className="ease-curve"><rect x="4" y="14" width="92" height="72" fill="none" stroke="#ffffff22" /><polyline points={pts.join(' ')} fill="none" stroke="#7b6cff" strokeWidth="3" /></svg>;
}
