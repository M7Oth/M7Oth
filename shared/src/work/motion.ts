import type { L10n, Requirement } from '../types';
import type { Rng } from '../rng';
import { l, near } from '../util';
import { arr, COLORS, mkReq, num, sameColor, SLOGANS, str, type WorkModule } from './common';

export type MProp = 'x' | 'y' | 'opacity' | 'scale' | 'rotation';
export const MPROPS: MProp[] = ['x', 'y', 'opacity', 'scale', 'rotation'];
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'back';
export const EASES: Ease[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'back'];
export const EASE_NAMES: Record<Ease, L10n> = {
  linear: l('خطي', 'Linear'), easeIn: l('تسارع (Ease In)', 'Ease In'), easeOut: l('تباطؤ (Ease Out)', 'Ease Out'),
  easeInOut: l('ناعم (Ease In-Out)', 'Ease In-Out'), back: l('ارتداد (Back)', 'Back'),
};
export const PROP_NAMES: Record<MProp, L10n> = {
  x: l('الموقع الأفقي X', 'Position X'), y: l('الموقع العمودي Y', 'Position Y'), opacity: l('الشفافية', 'Opacity'),
  scale: l('الحجم', 'Scale'), rotation: l('الدوران', 'Rotation'),
};

export interface Keyframe { t: number; v: number; ease: Ease }
export interface MLayer {
  id: string;
  kind: 'text' | 'rect' | 'circle' | 'logo';
  label: L10n;
  content: string;
  color: string;
  base: Record<MProp, number>;
  keys: Partial<Record<MProp, Keyframe[]>>;
}
export interface MotionDoc { duration: number; width: number; height: number; bg: string; layers: MLayer[] }

export function applyEase(e: Ease, u: number) {
  switch (e) {
    case 'easeIn': return u * u * u;
    case 'easeOut': return 1 - Math.pow(1 - u, 3);
    case 'easeInOut': return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    case 'back': { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
    default: return u;
  }
}

export function sortedKeys(layer: MLayer, prop: MProp) {
  return [...(layer.keys[prop] ?? [])].sort((a, b) => a.t - b.t);
}

export function evalProp(layer: MLayer, prop: MProp, t: number): number {
  const ks = sortedKeys(layer, prop);
  if (!ks.length) return layer.base[prop];
  if (t <= ks[0].t) return ks[0].v;
  if (t >= ks[ks.length - 1].t) return ks[ks.length - 1].v;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * applyEase(a.ease, u);
    }
  }
  return layer.base[prop];
}

const layerName = (d: MotionDoc, id: string) => d.layers.find((x) => x.id === id)?.label ?? l(id, id);

export const motionModule: WorkModule = {
  specialty: 'motion',
  generate(rng: Rng, ctx) {
    const tier = ctx.tier;
    const slogan = rng.pick(SLOGANS);
    const bg = rng.pick(['#14161f', '#1b2a4a', '#2b1d3a', '#0f2a24']);
    const doc: MotionDoc = {
      duration: tier >= 3 ? 6 : 5, width: 960, height: 540, bg,
      layers: [
        { id: 'title', kind: 'text', label: l('العنوان', 'Title'), content: ctx.brand.ar, color: '#ffffff', base: { x: 480, y: 220, opacity: 1, scale: 1, rotation: 0 }, keys: {} },
        { id: 'logo', kind: 'logo', label: l('الشعار', 'Logo'), content: '', color: rng.pick(['#f2b134', '#e25b45', '#21b38a', '#7b6cff']), base: { x: 480, y: 360, opacity: 1, scale: 1, rotation: 0 }, keys: {} },
        { id: 'tagline', kind: 'text', label: l('الشعار النصي', 'Tagline'), content: slogan.ar, color: '#f5ecd7', base: { x: 480, y: 450, opacity: 1, scale: 1, rotation: 0 }, keys: {} },
        { id: 'shape', kind: 'rect', label: l('الشكل الزخرفي', 'Accent shape'), content: '', color: '#2f9bff', base: { x: 160, y: 120, opacity: 1, scale: 1, rotation: 0 }, keys: {} },
      ],
    };
    const reqs: Omit<Requirement, 'id'>[] = [];
    const t2 = rng.pick([1, 1.5]);
    const fromX = rng.pick([-150, 1110]);
    const side = fromX < 0 ? l('يسار', 'left') : l('يمين', 'right');
    reqs.push(mkReq('move', { layer: 'title', prop: 'x', t1: 0, v1: fromX, t2, v2: 480 },
      l(`حرّك «العنوان» من خارج الشاشة من جهة ال${side.ar} (x=${fromX}) عند 0 ث ليصل إلى المنتصف (x=480) عند ${t2} ث.`, `Slide the Title in from the ${side.en} (x=${fromX}) at 0s to the center (x=480) at ${t2}s.`),
      l(`حدّد طبقة العنوان، ضع رأس التشغيل على 0 وأضف مفتاح X بقيمة ${fromX}، ثم على ${t2} أضف مفتاح X بقيمة 480.`, `Select Title, at 0s add an X keyframe = ${fromX}, then at ${t2}s add X = 480.`)));
    const f1 = rng.pick([0.5, 1]);
    reqs.push(mkReq('fade', { layer: 'logo', t1: f1, t2: f1 + 1, from: 0, to: 1 },
      l(`اجعل «الشعار» يظهر تدريجيًا من شفافية 0 عند ${f1} ث إلى 1 عند ${f1 + 1} ث.`, `Fade the Logo in from opacity 0 at ${f1}s to 1 at ${f1 + 1}s.`),
      l('أضف مفتاحي شفافية: 0 ثم 1.', 'Add two opacity keyframes: 0 then 1.')));
    if (tier >= 2) {
      reqs.push(mkReq('scale', { layer: 'logo', t1: f1, t2: f1 + 1, from: 0.5, to: 1 },
        l(`كبّر «الشعار» من 0.5 إلى 1 بين ${f1} ث و${f1 + 1} ث.`, `Scale the Logo from 0.5 to 1 between ${f1}s and ${f1 + 1}s.`),
        l('أضف مفتاحي حجم بنفس توقيت الظهور.', 'Add two scale keyframes at the same times as the fade.')));
      const o1 = doc.duration - 1;
      reqs.push(mkReq('fade', { layer: 'tagline', t1: o1, t2: o1 + 0.5, from: 1, to: 0 },
        l(`اجعل «الشعار النصي» يختفي من 1 إلى 0 بين ${o1} ث و${o1 + 0.5} ث.`, `Fade the Tagline out from 1 to 0 between ${o1}s and ${o1 + 0.5}s.`),
        l('أضف مفتاح شفافية 1 ثم مفتاح 0.', 'Add an opacity keyframe 1 then 0.')));
    }
    if (tier >= 3) {
      const e = rng.pick(['easeOut', 'easeInOut', 'back'] as Ease[]);
      reqs.push(mkReq('ease', { layer: 'title', prop: 'x', ease: e },
        l(`استخدم منحنى «${EASE_NAMES[e].ar}» لحركة العنوان.`, `Use the "${EASE_NAMES[e].en}" curve for the Title motion.`),
        l('حدّد أول مفتاح X للعنوان واختر المنحنى.', 'Select the first X keyframe of the Title and choose the curve.'), 0.7));
      const deg = rng.pick([90, 180, 360]);
      reqs.push(mkReq('rotate', { layer: 'shape', t1: 0, t2: 2, deg },
        l(`دوّر «الشكل الزخرفي» ${deg} درجة خلال أول ثانيتين.`, `Rotate the Accent shape by ${deg}° during the first 2 seconds.`),
        l('مفتاح دوران 0 عند 0 ث ثم مفتاح بالقيمة المطلوبة عند 2 ث.', 'Rotation key 0 at 0s, then the target value at 2s.')));
    }
    if (tier >= 4) {
      reqs.push(mkReq('sequence', { first: 'title', second: 'tagline' },
        l('لا تبدأ حركة «الشعار النصي» إلا بعد انتهاء حركة العنوان.', 'The Tagline animation must start only after the Title animation ends.'),
        l('اجعل أول مفتاح للشعار النصي بعد آخر مفتاح للعنوان.', 'Place the Tagline\'s first keyframe after the Title\'s last one.'), 0.7));
      reqs.push(mkReq('hold', { layer: 'title', prop: 'x', t1: t2, t2: t2 + 2 },
        l(`ثبّت العنوان في المنتصف من ${t2} ث حتى ${t2 + 2} ث.`, `Hold the Title in the center from ${t2}s to ${t2 + 2}s.`),
        l('لا تضف مفاتيح X تغيّر موقعه خلال هذه الفترة.', 'Do not add X keys that move it during that window.'), 0.6));
    }
    if (tier >= 5) {
      const c = rng.pick(COLORS.filter((x) => x.hex !== '#2f9bff'));
      reqs.push(mkReq('color', { layer: 'shape', color: c.hex }, l(`غيّر لون الشكل الزخرفي إلى ${c.name.ar}.`, `Change the Accent shape color to ${c.name.en}.`), l('من الخصائص اختر اللون.', 'Pick the color in properties.'), 0.5));
      reqs.push(mkReq('move', { layer: 'tagline', prop: 'y', t1: 2, v1: 600, t2: 3, v2: 450 },
        l('أدخل «الشعار النصي» من الأسفل (y=600) عند 2 ث إلى y=450 عند 3 ث.', 'Bring the Tagline up from y=600 at 2s to y=450 at 3s.'),
        l('مفتاحا Y للشعار النصي.', 'Two Y keys on the Tagline.')));
    }
    const kinds = [l('فاصل افتتاحي', 'Intro bumper'), l('شعار متحرك', 'Logo animation'), l('إعلان موشن', 'Motion ad'), l('عنوان متحرك', 'Animated title')];
    const k = rng.pick(kinds);
    return { title: l(`${k.ar} لـ${ctx.brand.ar}`, `${k.en} for ${ctx.brand.en}`), doc, requirements: reqs };
  },

  check(doc: MotionDoc, r: Requirement) {
    const p = r.params;
    const layer = doc.layers.find((x) => x.id === p.layer);
    switch (r.kind) {
      case 'move': {
        if (!layer) return { ok: false };
        const tol = p.prop === 'x' || p.prop === 'y' ? 20 : 0.08;
        const ok = (layer.keys[p.prop as MProp]?.length ?? 0) >= 2 && near(evalProp(layer, p.prop, p.t1), p.v1, tol * 1.5) && near(evalProp(layer, p.prop, p.t2), p.v2, tol);
        return { ok };
      }
      case 'fade':
        if (!layer) return { ok: false };
        return { ok: (layer.keys.opacity?.length ?? 0) >= 2 && near(evalProp(layer, 'opacity', p.t1), p.from, 0.06) && near(evalProp(layer, 'opacity', p.t2), p.to, 0.06) };
      case 'scale':
        if (!layer) return { ok: false };
        return { ok: (layer.keys.scale?.length ?? 0) >= 2 && near(evalProp(layer, 'scale', p.t1), p.from, 0.06) && near(evalProp(layer, 'scale', p.t2), p.to, 0.06) };
      case 'rotate': {
        if (!layer) return { ok: false };
        const d = evalProp(layer, 'rotation', p.t2) - evalProp(layer, 'rotation', p.t1);
        return { ok: near(Math.abs(d), p.deg, 6) };
      }
      case 'ease': {
        if (!layer) return { ok: false };
        const ks = sortedKeys(layer, p.prop);
        return { ok: ks.length >= 2 && ks.slice(0, -1).some((k) => k.ease === p.ease) };
      }
      case 'sequence': {
        const a = doc.layers.find((x) => x.id === p.first), b = doc.layers.find((x) => x.id === p.second);
        if (!a || !b) return { ok: false };
        const at = Object.values(a.keys).flat().map((k) => k!.t);
        const bt = Object.values(b.keys).flat().map((k) => k!.t);
        if (!at.length || !bt.length) return { ok: false };
        return { ok: Math.min(...bt) >= Math.max(...at) - 0.05 };
      }
      case 'hold': {
        if (!layer) return { ok: false };
        const v0 = evalProp(layer, p.prop, p.t1);
        for (let t = p.t1; t <= p.t2 + 1e-6; t += 0.25) if (!near(evalProp(layer, p.prop, t), v0, 2)) return { ok: false };
        return { ok: true };
      }
      case 'color':
        return { ok: !!layer && sameColor(layer.color, p.color) };
    }
    return { ok: false };
  },

  tweak(rng, doc: MotionDoc, existing) {
    if (!existing.some((r) => r.kind === 'color')) {
      const c = rng.pick(COLORS.filter((x) => !sameColor(x.hex, doc.layers.find((y) => y.id === 'shape')?.color)));
      return mkReq('color', { layer: 'shape', color: c.hex }, l(`نرجو تغيير لون الشكل الزخرفي إلى ${c.name.ar}.`, `Please change the Accent shape to ${c.name.en}.`), l('حدّد الشكل وغيّر لونه.', 'Select the shape and change its color.'), 0.6);
    }
    if (!existing.some((r) => (r.kind === 'fade' && r.params.layer === 'title') || r.kind === 'sequence')) {
      const e = doc.duration;
      return mkReq('fade', { layer: 'title', t1: e - 1, t2: e - 0.5, from: 1, to: 0 }, l(`اجعل العنوان يختفي بين ${e - 1} و${e - 0.5} ث.`, `Fade the Title out between ${e - 1}s and ${e - 0.5}s.`), l('مفتاحا شفافية للعنوان.', 'Two opacity keys on the Title.'), 0.6);
    }
    return null;
  },

  sanitize(d: any): MotionDoc {
    const layers = arr(d?.layers, 12).map((x: any) => {
      const base: any = {};
      for (const p of MPROPS) base[p] = num(x.base?.[p], p === 'opacity' || p === 'scale' ? 1 : 0, -5000, 5000);
      const keys: any = {};
      for (const p of MPROPS) {
        if (Array.isArray(x.keys?.[p])) keys[p] = arr(x.keys[p], 30).map((k: any) => ({ t: num(k.t, 0, 0, 60), v: num(k.v, 0, -5000, 5000), ease: (EASES.includes(k.ease) ? k.ease : 'linear') as Ease }));
      }
      return { id: str(x.id, 20), kind: x.kind, label: { ar: str(x.label?.ar, 40), en: str(x.label?.en, 40) }, content: str(x.content, 80), color: str(x.color, 9), base, keys };
    });
    return { duration: num(d?.duration, 5, 1, 30), width: 960, height: 540, bg: str(d?.bg, 9), layers };
  },
};

export const motionOps = {
  setKey(doc: MotionDoc, layerId: string, prop: MProp, t: number, v: number, ease?: Ease): MotionDoc {
    t = Math.round(t * 100) / 100;
    return {
      ...doc,
      layers: doc.layers.map((ly) => {
        if (ly.id !== layerId) return ly;
        const ks = [...(ly.keys[prop] ?? [])];
        const i = ks.findIndex((k) => Math.abs(k.t - t) < 0.02);
        if (i >= 0) ks[i] = { ...ks[i], v, ease: ease ?? ks[i].ease };
        else ks.push({ t, v, ease: ease ?? 'linear' });
        ks.sort((a, b) => a.t - b.t);
        return { ...ly, keys: { ...ly.keys, [prop]: ks } };
      }),
    };
  },
  removeKey(doc: MotionDoc, layerId: string, prop: MProp, t: number): MotionDoc {
    return { ...doc, layers: doc.layers.map((ly) => (ly.id !== layerId ? ly : { ...ly, keys: { ...ly.keys, [prop]: (ly.keys[prop] ?? []).filter((k) => Math.abs(k.t - t) >= 0.02) } })) };
  },
  moveKey(doc: MotionDoc, layerId: string, prop: MProp, fromT: number, toT: number): MotionDoc {
    return { ...doc, layers: doc.layers.map((ly) => (ly.id !== layerId ? ly : { ...ly, keys: { ...ly.keys, [prop]: (ly.keys[prop] ?? []).map((k) => (Math.abs(k.t - fromT) < 0.02 ? { ...k, t: Math.round(toT * 100) / 100 } : k)).sort((a, b) => a.t - b.t) } })) };
  },
  setBase(doc: MotionDoc, layerId: string, prop: MProp, v: number): MotionDoc {
    return { ...doc, layers: doc.layers.map((ly) => (ly.id !== layerId ? ly : { ...ly, base: { ...ly.base, [prop]: v } })) };
  },
  setLayer(doc: MotionDoc, layerId: string, patch: Partial<MLayer>): MotionDoc {
    return { ...doc, layers: doc.layers.map((ly) => (ly.id !== layerId ? ly : { ...ly, ...patch })) };
  },
};
export { layerName };
