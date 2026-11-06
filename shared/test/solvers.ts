import { videoOps, clipStarts, motionOps, graphicOps, sceneOps, type VideoDoc, type Requirement, type Task } from '../src';

/** Solve a video task the way a player would, using only editor operations. */
export function solveVideo(doc: VideoDoc, reqs: Requirement[]): VideoDoc {
  let d = doc;
  const tlTime = (mediaId: string, src: number) => {
    const st = clipStarts(d);
    const i = d.clips.findIndex((c) => c.mediaId === mediaId && src >= c.srcIn && src <= c.srcOut);
    return st[i] + (src - d.clips[i].srcIn);
  };
  for (const r of reqs) {
    const p = r.params;
    if (r.kind === 'removeClip') d = d.clips.filter((c) => c.mediaId === p.mediaId).reduce((acc, c) => videoOps.remove(acc, c.id), d);
    if (r.kind === 'removeRange') {
      d = videoOps.split(d, tlTime(p.mediaId, p.from));
      d = videoOps.split(d, tlTime(p.mediaId, p.to));
      const mid = d.clips.find((c) => c.mediaId === p.mediaId && Math.abs(c.srcIn - p.from) < 0.01)!;
      d = videoOps.remove(d, mid.id);
    }
    if (r.kind === 'trimTo') {
      d = videoOps.split(d, tlTime(p.mediaId, p.keep));
      const tail = d.clips.find((c) => c.mediaId === p.mediaId && Math.abs(c.srcIn - p.keep) < 0.01)!;
      d = videoOps.remove(d, tail.id);
    }
    if (r.kind === 'order') {
      const ia = d.clips.findIndex((c) => c.mediaId === p.after);
      const b = d.clips.find((c) => c.mediaId === p.before)!;
      d = videoOps.move(d, b.id, ia);
    }
  }
  for (const r of reqs) {
    const p = r.params;
    if (r.kind === 'addText') d = videoOps.addText(d, p.content.ar, p.from, p.to);
    if (r.kind === 'textColor') d = { ...d, texts: d.texts.map((t) => ({ ...t, color: p.color })) };
    if (r.kind === 'allTextColor') d = { ...d, texts: d.texts.map((t) => ({ ...t, color: p.color })) };
    if (r.kind === 'textPosition') d = { ...d, texts: d.texts.map((t) => ({ ...t, position: p.position })) };
    if (r.kind === 'transition') { let idx = -1; d.clips.forEach((c, i) => { if (c.mediaId === p.mediaId) idx = i; }); d = videoOps.setClip(d, d.clips[idx].id, { transOut: p.kind }); }
    if (r.kind === 'grade') for (const c of d.clips.filter((c) => c.mediaId === p.mediaId)) d = videoOps.setClip(d, c.id, { grade: p.grade });
    if (r.kind === 'overlay') d = videoOps.addOverlay(d, p.mediaId, p.from, p.to);
  }
  for (const r of reqs) if (r.kind === 'music') { d = videoOps.addAudio(d, r.params.trackId); d = videoOps.setAudio(d, d.audio[0].id, { volume: r.params.maxVolume }); }
  return d;
}


export function solveMotion(doc: any, reqs: Requirement[]) {
  let d = doc;
  for (const r of reqs) {
    const p = r.params;
    if (r.kind === 'move') { d = motionOps.setKey(d, p.layer, p.prop, p.t1, p.v1); d = motionOps.setKey(d, p.layer, p.prop, p.t2, p.v2); }
    if (r.kind === 'fade') { d = motionOps.setKey(d, p.layer, 'opacity', p.t1, p.from); d = motionOps.setKey(d, p.layer, 'opacity', p.t2, p.to); }
    if (r.kind === 'scale') { d = motionOps.setKey(d, p.layer, 'scale', p.t1, p.from); d = motionOps.setKey(d, p.layer, 'scale', p.t2, p.to); }
    if (r.kind === 'rotate') { d = motionOps.setKey(d, p.layer, 'rotation', p.t1, 0); d = motionOps.setKey(d, p.layer, 'rotation', p.t2, p.deg); }
    if (r.kind === 'color') d = motionOps.setLayer(d, p.layer, { color: p.color });
  }
  for (const r of reqs) if (r.kind === 'ease') { const k = d.layers.find((x: any) => x.id === r.params.layer).keys.x[0]; d = motionOps.setKey(d, r.params.layer, 'x', k.t, k.v, r.params.ease); }
  return d;
}
export function solveGraphic(doc: any, reqs: Requirement[]) {
  let d = doc;
  for (const r of reqs) {
    const p = r.params;
    if (r.kind === 'bg') d = { ...d, background: p.color };
    if (r.kind === 'font') d = graphicOps.set(d, p.el, { font: p.font });
    if (r.kind === 'fontSize') d = graphicOps.set(d, p.el, { fontSize: p.min });
    if (r.kind === 'color') d = graphicOps.set(d, p.el, { color: p.color });
    if (r.kind === 'sizeMin') d = graphicOps.set(d, p.el, { w: p.w });
  }
  for (const r of reqs) {
    const p = r.params;
    if (r.kind === 'centerH') d = graphicOps.align(d, p.el, 'centerH');
    if (r.kind === 'corner') { d = graphicOps.align(d, p.el, p.corner.endsWith('l') ? 'left' : 'right'); d = graphicOps.align(d, p.el, p.corner.startsWith('t') ? 'top' : 'bottom'); }
    if (r.kind === 'addText') { d = graphicOps.add(d, 'text', p.content.ar); d = graphicOps.set(d, d.elements[d.elements.length - 1].id, { x: 220, y: 200 }); }
    if (r.kind === 'above') d = graphicOps.set(d, p.el, { z: 10 });
  }
  return d;
}
export function solveScene(doc: any, reqs: Requirement[]) {
  let d = doc;
  for (const r of reqs) {
    const p = r.params;
    if (r.kind === 'centered') d = sceneOps.set(d, 'hero', { x: 0, z: 0 });
    if (r.kind === 'material') d = sceneOps.set(d, 'hero', { material: p.material });
    if (r.kind === 'addObjects') for (let i = 0; i < p.count; i++) d = sceneOps.add(d, p.kind);
    if (r.kind === 'light') d = sceneOps.light(d, { tone: p.tone });
    if (r.kind === 'rim') d = sceneOps.light(d, { rim: true });
    if (r.kind === 'rotate') d = sceneOps.set(d, 'hero', { rotY: p.deg });
    if (r.kind === 'heroColor') d = sceneOps.set(d, 'hero', { color: p.color });
  }
  for (const r of reqs) {
    const p = r.params;
    if (r.kind === 'scaleRatio') d = sceneOps.set(d, 'hero', { scale: p.ratio });
    if (r.kind === 'colorKind') for (const o of d.objects.filter((o: any) => o.kind === p.kind && o.id !== 'hero')) d = sceneOps.set(d, o.id, { color: p.color });
    if (r.kind === 'materialKind') for (const o of d.objects.filter((o: any) => o.kind === p.kind && o.id !== 'hero')) d = sceneOps.set(d, o.id, { material: p.material });
  }
  return d;
}
export function solveTask(t: Task) {
  if (t.specialty === 'video') return solveVideo(t.doc, t.requirements);
  if (t.specialty === 'motion') return solveMotion(t.doc, t.requirements);
  if (t.specialty === 'graphic') return solveGraphic(t.doc, t.requirements);
  return solveScene(t.doc, t.requirements);
}
