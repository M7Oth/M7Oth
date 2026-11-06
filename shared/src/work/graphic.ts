import type { L10n, Requirement } from '../types';
import type { Rng } from '../rng';
import { l, normText } from '../util';
import { arr, COLORS, colorName, mkReq, num, sameColor, SLOGANS, str, type WorkModule } from './common';

export const FONTS = ['Cairo', 'Tajawal', 'Amiri', 'Lalezar', 'Reem Kufi'];

export interface GElement {
  id: string;
  kind: 'text' | 'rect' | 'circle' | 'image' | 'logo';
  label: L10n;
  content: string;
  x: number; y: number; w: number; h: number;
  color: string;
  font: string;
  fontSize: number;
  z: number;
}
export interface GraphicDoc { width: number; height: number; background: string; elements: GElement[]; nextId: number }

const CORNERS: Record<string, L10n> = {
  tl: l('العلوية اليسرى', 'top-left'), tr: l('العلوية اليمنى', 'top-right'),
  bl: l('السفلية اليسرى', 'bottom-left'), br: l('السفلية اليمنى', 'bottom-right'),
};

export function overlaps(a: GElement, b: GElement) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export const graphicModule: WorkModule = {
  specialty: 'graphic',
  generate(rng: Rng, ctx) {
    const tier = ctx.tier;
    const square = rng.chance(0.5);
    const W = 800, H = square ? 800 : 1000;
    const els: GElement[] = [
      { id: 'headline', kind: 'text', label: l('العنوان الرئيسي', 'Headline'), content: ctx.brand.ar, x: rng.int(60, 200), y: 90, w: 420, h: 90, color: '#111111', font: 'Tajawal', fontSize: 40, z: 3 },
      { id: 'photo', kind: 'image', label: l('صورة المنتج', 'Product photo'), content: '', x: rng.int(80, 200), y: square ? 240 : 280, w: 460, h: square ? 300 : 380, color: '#9fb3c8', font: '', fontSize: 0, z: 1 },
      { id: 'logo', kind: 'logo', label: l('الشعار', 'Logo'), content: '', x: rng.int(300, 400), y: rng.int(300, 450), w: 110, h: 110, color: rng.pick(['#e25b45', '#21b38a', '#7b6cff']), font: '', fontSize: 0, z: 2 },
      { id: 'cta', kind: 'rect', label: l('زر الطلب', 'CTA button'), content: l('اطلب الآن', 'Order now').ar, x: rng.int(150, 350), y: H - 170, w: 260, h: 70, color: '#2f6fdf', font: 'Cairo', fontSize: 26, z: 4 },
    ];
    const doc: GraphicDoc = { width: W, height: H, background: '#f5ecd7', elements: els, nextId: 10 };
    const reqs: Omit<Requirement, 'id'>[] = [];
    reqs.push(mkReq('centerH', { el: 'headline' }, l('توسيط «العنوان الرئيسي» أفقيًا.', 'Center the Headline horizontally.'), l('حدّد العنوان واضغط «توسيط أفقي».', 'Select the Headline and press "Center horizontally".')));
    const bg = rng.pick(COLORS.filter((c) => c.hex !== '#f5ecd7'));
    reqs.push(mkReq('bg', { color: bg.hex }, l(`اجعل لون الخلفية ${bg.name.ar}.`, `Make the background ${bg.name.en}.`), l('اضغط على مساحة فارغة واختر لون الخلفية.', 'Click empty space and pick the background color.'), 0.8));
    const head = bg.hex === '#ffffff' || bg.hex === '#f5ecd7' ? '#1b2a4a' : '#ffffff';
    if (tier >= 2) {
      const f = rng.pick(FONTS.filter((x) => x !== 'Tajawal'));
      reqs.push(mkReq('font', { el: 'headline', font: f }, l(`استخدم خط «${f}» للعنوان.`, `Use the "${f}" font for the Headline.`), l('من قائمة الخطوط اختر الخط.', 'Pick it from the fonts list.'), 0.7));
      const size = rng.pick([56, 64, 72]);
      reqs.push(mkReq('fontSize', { el: 'headline', min: size }, l(`كبّر خط العنوان إلى ${size} على الأقل.`, `Make the Headline font at least ${size}.`), l('عدّل حجم الخط من الخصائص.', 'Change font size in properties.'), 0.7));
      const corner = rng.pick(['tl', 'tr', 'br'] as const);
      reqs.push(mkReq('corner', { el: 'logo', corner, margin: 40 }, l(`ضع «الشعار» في الزاوية ${CORNERS[corner].ar} بهامش 40 بكسل تقريبًا.`, `Place the Logo in the ${CORNERS[corner].en} corner with ~40px margin.`), l('استخدم أزرار المحاذاة أو اسحبه للزاوية.', 'Use align buttons or drag it to the corner.')));
      reqs.push(mkReq('color', { el: 'headline', color: head }, l(`اجعل لون العنوان ${colorName(head).ar} ليتباين مع الخلفية.`, `Make the Headline ${colorName(head).en} for contrast.`), l('حدّد العنوان وغيّر لونه.', 'Select the Headline and change its color.'), 0.6));
    }
    if (tier >= 3) {
      const s = rng.pick(SLOGANS);
      reqs.push(mkReq('addText', { content: s }, l(`أضف نصًا جديدًا يقول «${s.ar}».`, `Add a new text that says "${s.en}".`), l('من «إضافة» اختر نص واكتب العبارة.', 'Use Add → Text and type the phrase.')));
      reqs.push(mkReq('above', { el: 'logo', other: 'photo' }, l('يجب أن يكون الشعار فوق صورة المنتج في ترتيب الطبقات.', 'The Logo must be above the product photo in layer order.'), l('حدّد الشعار واضغط «طبقة للأمام».', 'Select the Logo and press "Bring forward".'), 0.6));
    }
    if (tier >= 4) {
      reqs.push(mkReq('noOverlap', { a: 'cta', b: 'photo' }, l('لا تجعل زر الطلب يتداخل مع صورة المنتج.', 'The CTA button must not overlap the product photo.'), l('حرّك الزر أو صغّر الصورة.', 'Move the button or shrink the photo.')));
      reqs.push(mkReq('centerH', { el: 'cta' }, l('وسّط زر الطلب أفقيًا.', 'Center the CTA button horizontally.'), l('حدّد الزر واضغط «توسيط أفقي».', 'Select it and press "Center horizontally".'), 0.6));
    }
    if (tier >= 5) {
      reqs.push(mkReq('sizeMin', { el: 'photo', w: 560 }, l('كبّر صورة المنتج ليصبح عرضها 560 بكسل على الأقل.', 'Make the product photo at least 560px wide.'), l('عدّل العرض من الخصائص.', 'Change width in properties.'), 0.6));
      reqs.push(mkReq('noOverlap', { a: 'logo', b: 'headline' }, l('لا تجعل الشعار يغطي العنوان.', 'The Logo must not cover the Headline.'), l('أبعد الشعار عن العنوان.', 'Move the Logo away from the Headline.'), 0.6));
    }
    reqs.push(mkReq('inBounds', {}, l('كل العناصر داخل حدود التصميم.', 'All elements stay inside the artboard.'), l('لا تترك عنصرًا خارج اللوحة.', 'Do not leave anything outside.'), 0.5));
    const kinds = [l('بوستر إعلاني', 'Ad poster'), l('منشور سوشيال', 'Social post'), l('غلاف عرض', 'Promo cover'), l('إعلان افتتاح', 'Opening announcement')];
    const k = rng.pick(kinds);
    return { title: l(`${k.ar} لـ${ctx.brand.ar}`, `${k.en} for ${ctx.brand.en}`), doc, requirements: reqs };
  },

  check(doc: GraphicDoc, r: Requirement) {
    const p = r.params;
    const el = doc.elements.find((e) => e.id === p.el);
    const W = doc.width, H = doc.height;
    switch (r.kind) {
      case 'centerH': return { ok: !!el && Math.abs(el.x + el.w / 2 - W / 2) <= 6 };
      case 'bg': return { ok: sameColor(doc.background, p.color) };
      case 'font': return { ok: !!el && el.font === p.font };
      case 'fontSize': return { ok: !!el && el.fontSize >= p.min };
      case 'color': return { ok: !!el && sameColor(el.color, p.color) };
      case 'corner': {
        if (!el) return { ok: false };
        const m = p.margin, tol = 22;
        const left = el.x, right = W - (el.x + el.w), top = el.y, bottom = H - (el.y + el.h);
        const okH = p.corner.endsWith('l') ? Math.abs(left - m) <= tol : Math.abs(right - m) <= tol;
        const okV = p.corner.startsWith('t') ? Math.abs(top - m) <= tol : Math.abs(bottom - m) <= tol;
        return { ok: okH && okV };
      }
      case 'addText': return { ok: doc.elements.some((e) => e.kind === 'text' && (normText(e.content) === normText(p.content.ar) || normText(e.content) === normText(p.content.en))) };
      case 'above': {
        const o = doc.elements.find((e) => e.id === p.other);
        return { ok: !!el && !!o && el.z > o.z };
      }
      case 'noOverlap': {
        const a = doc.elements.find((e) => e.id === p.a), b = doc.elements.find((e) => e.id === p.b);
        return { ok: !!a && !!b && !overlaps(a, b) };
      }
      case 'sizeMin': return { ok: !!el && el.w >= p.w };
      case 'inBounds': return { ok: doc.elements.every((e) => e.x >= -1 && e.y >= -1 && e.x + e.w <= W + 1 && e.y + e.h <= H + 1) };
    }
    return { ok: false };
  },

  tweak(rng, doc: GraphicDoc, existing) {
    const opts: (() => Omit<Requirement, 'id'> | null)[] = [
      () => existing.some((r) => r.kind === 'color' && r.params.el === 'cta') ? null : (() => {
        const c = rng.pick(COLORS.filter((x) => !sameColor(x.hex, doc.elements.find((e) => e.id === 'cta')?.color) && !sameColor(x.hex, doc.background)));
        return mkReq('color', { el: 'cta', color: c.hex }, l(`غيّر لون زر الطلب إلى ${c.name.ar}.`, `Change the CTA button to ${c.name.en}.`), l('حدّد الزر وغيّر لونه.', 'Select the button and change its color.'), 0.6);
      })(),
      () => existing.some((r) => r.kind === 'fontSize') ? null : mkReq('fontSize', { el: 'headline', min: 60 }, l('العنوان صغير، كبّره إلى 60 على الأقل.', 'The headline is small; make it at least 60.'), l('عدّل حجم الخط.', 'Change font size.'), 0.6),
    ];
    for (const o of rng.shuffle(opts)) { const r = o(); if (r) return r; }
    return null;
  },

  sanitize(d: any): GraphicDoc {
    const elements = arr(d?.elements, 30).map((e: any) => ({
      id: str(e.id, 20), kind: (['text', 'rect', 'circle', 'image', 'logo'].includes(e.kind) ? e.kind : 'rect') as GElement['kind'],
      label: { ar: str(e.label?.ar, 40), en: str(e.label?.en, 40) }, content: str(e.content, 80),
      x: num(e.x, 0, -2000, 4000), y: num(e.y, 0, -2000, 4000), w: num(e.w, 10, 1, 4000), h: num(e.h, 10, 1, 4000),
      color: str(e.color, 9), font: str(e.font, 20), fontSize: num(e.fontSize, 0, 0, 300), z: num(e.z, 0, -100, 100),
    }));
    return { width: num(d?.width, 800, 100, 2000), height: num(d?.height, 1000, 100, 2000), background: str(d?.background, 9), elements, nextId: num(d?.nextId, 10, 0, 1e6) };
  },
};

export const graphicOps = {
  set(doc: GraphicDoc, id: string, patch: Partial<GElement>): GraphicDoc { return { ...doc, elements: doc.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }; },
  align(doc: GraphicDoc, id: string, how: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom', margin = 40): GraphicDoc {
    const e = doc.elements.find((x) => x.id === id);
    if (!e) return doc;
    const p: Partial<GElement> = {};
    if (how === 'left') p.x = margin;
    if (how === 'right') p.x = doc.width - e.w - margin;
    if (how === 'centerH') p.x = Math.round((doc.width - e.w) / 2);
    if (how === 'top') p.y = margin;
    if (how === 'bottom') p.y = doc.height - e.h - margin;
    if (how === 'centerV') p.y = Math.round((doc.height - e.h) / 2);
    return graphicOps.set(doc, id, p);
  },
  add(doc: GraphicDoc, kind: GElement['kind'], content = ''): GraphicDoc {
    const id = `e${doc.nextId}`;
    const z = Math.max(0, ...doc.elements.map((e) => e.z)) + 1;
    const el: GElement = { id, kind, label: kind === 'text' ? l('نص جديد', 'New text') : l('عنصر جديد', 'New element'), content, x: 100, y: 100, w: kind === 'text' ? 360 : 160, h: kind === 'text' ? 70 : 160, color: kind === 'text' ? '#111111' : '#e25b45', font: 'Cairo', fontSize: kind === 'text' ? 36 : 0, z };
    return { ...doc, elements: [...doc.elements, el], nextId: doc.nextId + 1 };
  },
  remove(doc: GraphicDoc, id: string): GraphicDoc { return { ...doc, elements: doc.elements.filter((e) => e.id !== id) }; },
  layer(doc: GraphicDoc, id: string, dir: 1 | -1): GraphicDoc {
    const sorted = [...doc.elements].sort((a, b) => a.z - b.z);
    const i = sorted.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return doc;
    const zi = sorted[i].z, zj = sorted[j].z;
    const map: Record<string, number> = { [sorted[i].id]: zj === zi ? zi + dir : zj, [sorted[j].id]: zi };
    return { ...doc, elements: doc.elements.map((e) => (e.id in map ? { ...e, z: map[e.id] } : e)) };
  },
};
