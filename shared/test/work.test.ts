import { describe, expect, it } from 'vitest';
import { solveVideo } from './solvers';
import { makeRng, WORK_MODULES, checkAll, videoOps, clipStarts, clipLen, motionOps, graphicOps, sceneOps, type VideoDoc, type Requirement, type SpecialtyId } from '../src';

function gen(sp: SpecialtyId, tier: number, seed = 1) {
  const g = WORK_MODULES[sp].generate(makeRng(seed), { brand: { ar: 'مقهى', en: 'Cafe' }, tier, index: 0 });
  const reqs: Requirement[] = g.requirements.map((r, i) => ({ ...r, id: `r${i + 1}` }));
  return { ...g, reqs };
}

describe('video work', () => {
  it('untouched timeline fails the requirements', () => {
    const g = gen('video', 1);
    const { correctness } = checkAll('video', g.doc, g.reqs);
    expect(correctness).toBeLessThan(0.5);
  });
  for (let tier = 1; tier <= 5; tier++) for (let seed = 1; seed <= 25; seed++) {
    it(`tier ${tier} seed ${seed} is solvable with editor operations`, () => {
      const g = gen('video', tier, seed * 7 + tier);
      const solved = solveVideo(g.doc, g.reqs);
      const res = checkAll('video', solved, g.reqs);
      if (res.correctness < 1) console.log(JSON.stringify(g.reqs.map((r) => [r.kind, r.params])), res.results);
      expect(res.correctness).toBe(1);
    });
  }
  it('split keeps total duration and over-cutting breaks "preserve"', () => {
    const g = gen('video', 1, 3);
    const total = g.doc.clips.reduce((s: number, c: any) => s + clipLen(c), 0);
    const d = videoOps.split(g.doc, 2.5);
    expect(d.clips.length).toBe(g.doc.clips.length + 1);
    expect(d.clips.reduce((s, c) => s + clipLen(c), 0)).toBeCloseTo(total);
    const ruined = videoOps.remove(d, d.clips[0].id);
    const pres = g.reqs.find((r) => r.kind === 'preserve')!;
    expect(WORK_MODULES.video.check(ruined, pres, g.reqs).ok).toBe(false);
  });
});

describe('motion work', () => {
  it('keyframes satisfy move/fade/scale and timing is verified', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const g = gen('motion', tier, tier * 3);
      let d = g.doc;
      for (const r of g.reqs) {
        const p = r.params;
        if (r.kind === 'move') { d = motionOps.setKey(d, p.layer, p.prop, p.t1, p.v1); d = motionOps.setKey(d, p.layer, p.prop, p.t2, p.v2); }
        if (r.kind === 'fade') { d = motionOps.setKey(d, p.layer, 'opacity', p.t1, p.from); d = motionOps.setKey(d, p.layer, 'opacity', p.t2, p.to); }
        if (r.kind === 'scale') { d = motionOps.setKey(d, p.layer, 'scale', p.t1, p.from); d = motionOps.setKey(d, p.layer, 'scale', p.t2, p.to); }
        if (r.kind === 'rotate') { d = motionOps.setKey(d, p.layer, 'rotation', p.t1, 0); d = motionOps.setKey(d, p.layer, 'rotation', p.t2, p.deg); }
        if (r.kind === 'color') d = motionOps.setLayer(d, p.layer, { color: p.color });
      }
      for (const r of g.reqs) if (r.kind === 'ease') { const k = d.layers.find((x: any) => x.id === r.params.layer).keys.x[0]; d = motionOps.setKey(d, r.params.layer, 'x', k.t, k.v, r.params.ease); }
      const res = checkAll('motion', d, g.reqs);
      expect(res.correctness).toBe(1);
      // shifting a key by 0.5s breaks timing
      const mv = g.reqs.find((r) => r.kind === 'move')!;
      const off = motionOps.moveKey(d, mv.params.layer, 'x', mv.params.t2, mv.params.t2 + 3);
      expect(WORK_MODULES.motion.check(off, mv, g.reqs).ok).toBe(false);
    }
  });
});

describe('graphic work', () => {
  it('alignment, colors, fonts and layers are validated', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const g = gen('graphic', tier, tier * 11);
      let d = g.doc;
      for (const r of g.reqs) {
        const p = r.params;
        if (r.kind === 'bg') d = { ...d, background: p.color };
        if (r.kind === 'font') d = graphicOps.set(d, p.el, { font: p.font });
        if (r.kind === 'fontSize') d = graphicOps.set(d, p.el, { fontSize: p.min });
        if (r.kind === 'color') d = graphicOps.set(d, p.el, { color: p.color });
        if (r.kind === 'sizeMin') d = graphicOps.set(d, p.el, { w: p.w });
      }
      for (const r of g.reqs) {
        const p = r.params;
        if (r.kind === 'centerH') d = graphicOps.align(d, p.el, 'centerH');
        if (r.kind === 'corner') { d = graphicOps.align(d, p.el, p.corner.endsWith('l') ? 'left' : 'right'); d = graphicOps.align(d, p.el, p.corner.startsWith('t') ? 'top' : 'bottom'); }
        if (r.kind === 'addText') { d = graphicOps.add(d, 'text', p.content.ar); d = graphicOps.set(d, d.elements[d.elements.length - 1].id, { x: 220, y: 200 }); }
        if (r.kind === 'above') d = graphicOps.set(d, p.el, { z: 10 });
      }
      const res = checkAll('graphic', d, g.reqs);
      if (res.correctness < 1) console.log(tier, res.results, JSON.stringify(d.elements));
      expect(res.correctness).toBe(1);
    }
  });
});

describe('3d work', () => {
  it('scene requirements are checked', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const g = gen('model3d', tier, tier * 5);
      let d = g.doc;
      for (const r of g.reqs) {
        const p = r.params;
        if (r.kind === 'centered') d = sceneOps.set(d, 'hero', { x: 0, z: 0 });
        if (r.kind === 'material') d = sceneOps.set(d, 'hero', { material: p.material });
        if (r.kind === 'addObjects') for (let i = 0; i < p.count; i++) d = sceneOps.add(d, p.kind);
        if (r.kind === 'light') d = sceneOps.light(d, { tone: p.tone });
        if (r.kind === 'rim') d = sceneOps.light(d, { rim: true });
        if (r.kind === 'rotate') d = sceneOps.set(d, 'hero', { rotY: p.deg });
      }
      for (const r of g.reqs) {
        const p = r.params;
        if (r.kind === 'scaleRatio') d = sceneOps.set(d, 'hero', { scale: p.ratio });
        if (r.kind === 'colorKind') for (const o of d.objects.filter((o: any) => o.kind === p.kind && o.id !== 'hero')) d = sceneOps.set(d, o.id, { color: p.color });
        if (r.kind === 'materialKind') for (const o of d.objects.filter((o: any) => o.kind === p.kind && o.id !== 'hero')) d = sceneOps.set(d, o.id, { material: p.material });
      }
      const res = checkAll('model3d', d, g.reqs);
      if (res.correctness < 1) console.log(tier, res.results, JSON.stringify(d.objects));
      expect(res.correctness).toBe(1);
    }
  });
});
