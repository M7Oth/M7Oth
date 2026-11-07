import { useEffect, useMemo, useRef, useState } from 'react';
import { clipLen, clipStarts, COLORS, GRADE_NAMES, GRADES, timelineDuration, TRACKS, TRANSITION_NAMES, TRANSITIONS, videoOps, type VideoDoc, type VText } from '@fls/shared';
import { useL, useT } from '../i18n';
import { sfx } from '../audio';
import type { EditorProps } from '../ui/Computer';

const GRADE_CSS: Record<string, string> = { none: '', warm: 'sepia(0.35) saturate(1.3) hue-rotate(-10deg)', cool: 'saturate(0.9) hue-rotate(25deg) brightness(1.05)', bw: 'grayscale(1)', vivid: 'saturate(1.8) contrast(1.15)' };
const r1 = (v: number) => Math.round(v * 10) / 10;

export function VideoEditor({ doc: d, setDoc, reqs, help, zoom, guides, sloppy }: EditorProps) {
  const doc = d as VideoDoc;
  const T = useT();
  const L = useL();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<{ kind: 'clip' | 'text' | 'audio' | 'overlay'; id: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dur = timelineDuration(doc);
  const starts = clipStarts(doc);
  const pps = 22 * zoom; // pixels per second
  const snap = (v: number, fine = false) => {
    const step = fine ? 0.1 : 0.5;
    let x = Math.round(v / step) * step;
    if (guides) for (const s of [...starts, dur]) if (Math.abs(s - v) < 0.25) x = s;
    return Math.max(0, Math.min(dur, r1(x)));
  };
  const commit = (nd: VideoDoc) => setDoc(videoOps.fitAudio(nd));
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => { setT((x) => { const n = x + (now - last) / 1000; if (n >= dur) { setPlaying(false); return dur; } return n; }); last = now; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, dur]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); split(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'ArrowRight') setT((x) => Math.min(dur, r1(x + 0.5)));
      if (e.key === 'ArrowLeft') setT((x) => Math.max(0, r1(x - 0.5)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const clipAt = (time: number) => { const i = doc.clips.findIndex((c, k) => time >= starts[k] && time < starts[k] + clipLen(c)); return i < 0 ? doc.clips.length - 1 : i; };
  const cur = doc.clips[clipAt(t)];
  const media = (id?: string) => doc.media.find((m) => m.id === id);
  const split = () => {
    let at = t;
    if (sloppy && Math.random() < 0.35) at = r1(at + (Math.random() < 0.5 ? -0.5 : 0.5)); // tired hands slip
    const nd = videoOps.split(doc, at);
    if (nd !== doc) { sfx('cut'); commit(nd); }
  };
  const del = () => {
    if (!sel) return;
    if (sel.kind === 'clip') commit(videoOps.remove(doc, sel.id));
    if (sel.kind === 'text') commit(videoOps.removeText(doc, sel.id));
    if (sel.kind === 'audio') commit(videoOps.removeAudio(doc, sel.id));
    if (sel.kind === 'overlay') commit(videoOps.removeOverlay(doc, sel.id));
    setSel(null);
    sfx('pop');
  };
  const move = (dir: -1 | 1) => {
    if (sel?.kind !== 'clip') return;
    const i = doc.clips.findIndex((c) => c.id === sel.id);
    commit(videoOps.move(doc, sel.id, i + dir));
  };
  const selClip = sel?.kind === 'clip' ? doc.clips.find((c) => c.id === sel.id) : undefined;
  const selText = sel?.kind === 'text' ? doc.texts.find((x) => x.id === sel.id) : undefined;
  const selAudio = sel?.kind === 'audio' ? doc.audio.find((x) => x.id === sel.id) : undefined;
  const selOverlay = sel?.kind === 'overlay' ? doc.overlays.find((x) => x.id === sel.id) : undefined;

  // help: show where removals should happen on the CURRENT timeline
  const helpRanges = useMemo(() => {
    if (!help) return [] as { a: number; b: number; label: string }[];
    const out: { a: number; b: number; label: string }[] = [];
    for (const r of reqs) {
      if (r.kind === 'removeRange') doc.clips.forEach((c, i) => {
        const a = Math.max(c.srcIn, r.params.from), b = Math.min(c.srcOut, r.params.to);
        if (c.mediaId === r.params.mediaId && b - a > 0.05) out.push({ a: starts[i] + a - c.srcIn, b: starts[i] + b - c.srcIn, label: '✂' });
      });
      if (r.kind === 'trimTo') doc.clips.forEach((c, i) => {
        const a = Math.max(c.srcIn, r.params.keep), b = c.srcOut;
        if (c.mediaId === r.params.mediaId && b - a > 0.05) out.push({ a: starts[i] + a - c.srcIn, b: starts[i] + b - c.srcIn, label: '✂' });
      });
      if (r.kind === 'addText' || r.kind === 'overlay') out.push({ a: r.params.from, b: r.params.to, label: r.kind === 'addText' ? 'T' : 'V2' });
    }
    return out;
  }, [help, reqs, doc]); // eslint-disable-line react-hooks/exhaustive-deps

  const textsNow = doc.texts.filter((x) => t >= x.start && t < x.end);
  const ovNow = doc.overlays.find((o) => t >= o.start && t < o.end);
  const neededText = reqs.find((r) => r.kind === 'addText');
  const rulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft - 40;
    setT(snap(x / pps, e.shiftKey));
  };
  const lane = (s: number, len: number) => ({ left: 40 + s * pps, width: Math.max(4, len * pps) });

  return (
    <div className="ve" data-testid="video-editor">
      <div className="ve-top">
        <div className="ve-bin">
          <h5>🎞️ {T('مكتبة اللقطات', 'Media bin')}</h5>
          {doc.media.map((m) => (
            <div key={m.id} className="bin-item">
              <span className="sw" style={{ background: m.color }} />
              <span>{L(m.label)} <small>{m.length}s</small></span>
              {m.broll && <button className="btn tiny" data-testid="add-overlay" onClick={() => commit(videoOps.addOverlay(doc, m.id, snap(t), Math.min(dur, snap(t) + 3)))}>{T('طبقة علوية', 'Overlay')}</button>}
            </div>
          ))}
          <h5>🎵 {T('مكتبة الصوت', 'Audio library')}</h5>
          {TRACKS.map((tr) => <button key={tr.id} data-track={tr.id} className="btn tiny wide" onClick={() => { commit(videoOps.addAudio(doc, tr.id)); sfx('pop'); }}>+ {L(tr.name)}</button>)}
        </div>
        <div className="ve-preview">
          <div className="screen" style={{ background: media(cur?.mediaId)?.color ?? '#111', filter: GRADE_CSS[cur?.grade ?? 'none'] }}>
            <div className="scene-art">
              <div className="sun" /><div className="hill a" /><div className="hill b" />
            </div>
            <div className="clip-name">{L(media(cur?.mediaId)?.label)}{cur && <small> · src {r1(cur.srcIn + (t - starts[clipAt(t)]))}s</small>}</div>
            {ovNow && <div className="overlay-box" style={{ background: media(ovNow.mediaId)?.color }}>{L(media(ovNow.mediaId)?.label)}</div>}
            {textsNow.map((x) => <div key={x.id} className={`title-text pos-${x.position}`} style={{ color: x.color }}>{x.content}</div>)}
            {doc.audio.length > 0 && <div className="audio-ind">🎵 {doc.audio.map((a) => L(TRACKS.find((x) => x.id === a.trackId)?.name)).join(', ')}</div>}
          </div>
          <div className="transport">
            <button className="btn small" onClick={() => { if (t >= dur) setT(0); setPlaying(!playing); }}>{playing ? '⏸' : '▶'}</button>
            <span className="tc" data-testid="timecode">{r1(t).toFixed(1)}s / {r1(dur).toFixed(1)}s</span>
            <input type="number" step={0.5} min={0} max={dur} value={r1(t)} onChange={(e) => setT(Math.max(0, Math.min(dur, Number(e.target.value))))} data-testid="playhead-input" aria-label="playhead" />
          </div>
        </div>
        <div className="ve-props">
          <h5>⚙️ {T('الخصائص', 'Properties')}</h5>
          {!sel && <div className="muted tiny">{T('حدّد لقطة أو نصًا في التايملاين', 'Select a clip or text in the timeline')}</div>}
          {selClip && (
            <>
              <div><b>{L(media(selClip.mediaId)?.label)}</b></div>
              <div className="muted tiny">src {r1(selClip.srcIn)}–{r1(selClip.srcOut)}s ({r1(clipLen(selClip))}s)</div>
              <label>{T('تصحيح الألوان', 'Color grade')}<select data-testid="clip-grade" value={selClip.grade} onChange={(e) => commit(videoOps.setClip(doc, selClip.id, { grade: e.target.value }))}>{GRADES.map((g) => <option key={g} value={g}>{L(GRADE_NAMES[g])}</option>)}</select></label>
              <label>{T('الانتقال بعدها', 'Transition after')}<select data-testid="clip-trans" value={selClip.transOut} onChange={(e) => commit(videoOps.setClip(doc, selClip.id, { transOut: e.target.value }))}>{TRANSITIONS.map((g) => <option key={g} value={g}>{L(TRANSITION_NAMES[g])}</option>)}</select></label>
            </>
          )}
          {selText && <TextProps t={selText} onChange={(p) => commit(videoOps.updateText(doc, selText.id, p))} dur={dur} />}
          {selAudio && (
            <>
              <div><b>🎵 {L(TRACKS.find((x) => x.id === selAudio.trackId)?.name)}</b></div>
              <label>{T('مستوى الصوت', 'Volume')} {selAudio.volume}%<input type="range" min={0} max={100} step={5} value={selAudio.volume} onChange={(e) => commit(videoOps.setAudio(doc, selAudio.id, { volume: Number(e.target.value) }))} data-testid="volume" /></label>
            </>
          )}
          {selOverlay && (
            <>
              <div><b>V2: {L(media(selOverlay.mediaId)?.label)}</b></div>
              <label>{T('البداية', 'Start')}<input type="number" step={0.5} value={selOverlay.start} onChange={(e) => commit(videoOps.setOverlay(doc, selOverlay.id, { start: Number(e.target.value) }))} /></label>
              <label>{T('النهاية', 'End')}<input type="number" step={0.5} value={selOverlay.end} onChange={(e) => commit(videoOps.setOverlay(doc, selOverlay.id, { end: Number(e.target.value) }))} /></label>
            </>
          )}
        </div>
      </div>
      <div className="ve-tools">
        <button className={`btn small ${help && reqs.some((r) => ['removeRange', 'trimTo'].includes(r.kind)) ? 'glow' : ''}`} onClick={split} title="S" data-testid="tool-split">✂ {T('قص عند المؤشر', 'Split at playhead')} <kbd>S</kbd></button>
        <button className="btn small" disabled={!sel} onClick={del} data-testid="tool-delete">🗑 {T('حذف المحدد', 'Delete selected')} <kbd>Del</kbd></button>
        <button className="btn small" disabled={sel?.kind !== 'clip'} onClick={() => move(-1)} data-testid="tool-move-left">◀</button>
        <button className="btn small" disabled={sel?.kind !== 'clip'} onClick={() => move(1)} data-testid="tool-move-right">▶</button>
        <span className="muted tiny">{T('حرّك اللقطة المحددة أو اسحبها', 'Move the selected clip or drag it')}</span>
        <button className={`btn small ${help && neededText && !doc.texts.length ? 'glow' : ''}`} data-testid="tool-text" onClick={() => {
          const content = neededText && help ? L(neededText.params.content) : T('نص جديد', 'New text');
          const s = neededText && help ? neededText.params.from : snap(t);
          const e = neededText && help ? neededText.params.to : Math.min(dur, snap(t) + 3);
          const nd = videoOps.addText(doc, content, s, e);
          commit(nd);
          setSel({ kind: 'text', id: nd.texts[nd.texts.length - 1].id });
        }}>🅣 {T('إضافة نص', 'Add text')}</button>
        <span className="zoom-info muted tiny">🔍 {zoom}x {guides ? T('· محاذاة ذكية', '· smart snapping') : ''}</span>
      </div>
      <div className="timeline" dir="ltr" onClick={rulerClick} data-testid="timeline">
        <div className="tl-inner" style={{ width: dur * pps + 80 }}>
          <div className="ruler">{Array.from({ length: Math.ceil(dur) + 1 }).map((_, i) => <span key={i} style={lane(i, 0)}>{i % (zoom >= 2 ? 1 : 2) === 0 ? i : ''}</span>)}</div>
          {helpRanges.map((h, i) => <div key={i} className={`help-range ${h.label === '✂' ? 'cut' : 'place'}`} style={lane(h.a, h.b - h.a)}><span>{h.label} {r1(h.a)}–{r1(h.b)}</span></div>)}
          <div className="track label-v2"><span className="tname">V2</span>
            {doc.overlays.map((o) => <div key={o.id} className={`clip ov ${sel?.id === o.id ? 'sel' : ''}`} style={{ ...lane(o.start, o.end - o.start), background: media(o.mediaId)?.color }} onClick={(e) => { e.stopPropagation(); setSel({ kind: 'overlay', id: o.id }); }}>{L(media(o.mediaId)?.label)}</div>)}
          </div>
          <div className="track"><span className="tname">V1</span>
            {doc.clips.map((c, i) => (
              <div key={c.id} data-testid={`clip-${i}`} data-media={c.mediaId} className={`clip ${sel?.id === c.id ? 'sel' : ''} ${dragId === c.id ? 'drag' : ''}`} draggable
                style={{ ...lane(starts[i], clipLen(c)), background: media(c.mediaId)?.color, filter: GRADE_CSS[c.grade] }}
                onClick={(e) => { e.stopPropagation(); setSel({ kind: 'clip', id: c.id }); sfx('click'); }}
                onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== c.id) { commit(videoOps.move(doc, dragId, i)); sfx('pop'); } setDragId(null); }}>
                <span>{L(media(c.mediaId)?.label)}</span><small>{r1(clipLen(c))}s</small>
                {c.transOut !== 'none' && <i className="trans" title={L(TRANSITION_NAMES[c.transOut])}>⧓</i>}
              </div>
            ))}
          </div>
          <div className="track"><span className="tname">T</span>
            {doc.texts.map((x) => <div key={x.id} data-testid="text-clip" className={`clip txt ${sel?.id === x.id ? 'sel' : ''}`} style={{ ...lane(x.start, x.end - x.start) }} onClick={(e) => { e.stopPropagation(); setSel({ kind: 'text', id: x.id }); }}>🅣 {x.content}</div>)}
          </div>
          <div className="track"><span className="tname">A1</span>
            {doc.audio.map((a) => <div key={a.id} data-testid="audio-clip" className={`clip aud ${sel?.id === a.id ? 'sel' : ''}`} style={{ ...lane(a.start, a.end - a.start) }} onClick={(e) => { e.stopPropagation(); setSel({ kind: 'audio', id: a.id }); }}>🎵 {L(TRACKS.find((x) => x.id === a.trackId)?.name)} · {a.volume}%</div>)}
          </div>
          <div className="playhead" style={lane(t, 0)} />
        </div>
      </div>
    </div>
  );
}

function TextProps({ t, onChange, dur }: { t: VText; onChange: (p: Partial<VText>) => void; dur: number }) {
  const T = useT();
  const L = useL();
  return (
    <>
      <label>{T('النص', 'Text')}<input value={t.content} onChange={(e) => onChange({ content: e.target.value })} data-testid="text-content" /></label>
      <div className="row">
        <label>{T('من', 'From')}<input type="number" step={0.5} min={0} max={dur} value={t.start} onChange={(e) => onChange({ start: Number(e.target.value) })} data-testid="text-start" /></label>
        <label>{T('إلى', 'To')}<input type="number" step={0.5} min={0} max={dur} value={t.end} onChange={(e) => onChange({ end: Number(e.target.value) })} data-testid="text-end" /></label>
      </div>
      <span className="lbl">{T('اللون', 'Color')}</span>
      <div className="swatches">{COLORS.map((c) => <button key={c.hex} data-color={c.hex} title={L(c.name)} className={t.color === c.hex ? 'on' : ''} style={{ background: c.hex }} onClick={() => onChange({ color: c.hex })} />)}</div>
      <label>{T('الموضع', 'Position')}<select data-testid="text-position" value={t.position} onChange={(e) => onChange({ position: e.target.value as VText['position'] })}>
        <option value="top">{T('أعلى', 'Top')}</option><option value="center">{T('وسط', 'Center')}</option><option value="bottom">{T('أسفل', 'Bottom')}</option>
      </select></label>
    </>
  );
}
