import type { L10n, Requirement } from '../types';
import type { Rng } from '../rng';
import { l, near } from '../util';
import { arr, COLORS, mkReq, num, sameColor, str, type WorkModule } from './common';

export type Prim = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus';
export const PRIMS: Prim[] = ['cube', 'sphere', 'cylinder', 'cone', 'torus'];
export const PRIM_NAMES: Record<Prim, L10n> = {
  cube: l('مكعب', 'Cube'), sphere: l('كرة', 'Sphere'), cylinder: l('أسطوانة', 'Cylinder'), cone: l('مخروط', 'Cone'), torus: l('حلقة', 'Torus'),
};
export type Mat = 'plastic' | 'metal' | 'wood' | 'glass' | 'glow' | 'marble';
export const MATS: Mat[] = ['plastic', 'metal', 'wood', 'glass', 'glow', 'marble'];
export const MAT_NAMES: Record<Mat, L10n> = {
  plastic: l('بلاستيك', 'Plastic'), metal: l('معدن', 'Metal'), wood: l('خشب', 'Wood'), glass: l('زجاج', 'Glass'), glow: l('مضيء', 'Glow'), marble: l('رخام', 'Marble'),
};
export type LightTone = 'neutral' | 'warm' | 'cool';
export const LIGHT_NAMES: Record<LightTone, L10n> = { neutral: l('محايدة', 'Neutral'), warm: l('دافئة', 'Warm'), cool: l('باردة', 'Cool') };

export interface SObject { id: string; kind: Prim; label: L10n; x: number; z: number; scale: number; rotY: number; material: Mat; color: string }
export interface SceneDoc { objects: SObject[]; light: { tone: LightTone; intensity: number; rim: boolean }; bg: string; nextId: number }

export const radiusOf = (o: SObject) => (o.kind === 'torus' ? 0.75 : o.kind === 'cube' ? 0.6 : 0.5) * o.scale;

export const model3dModule: WorkModule = {
  specialty: 'model3d',
  generate(rng: Rng, ctx) {
    const tier = ctx.tier;
    const products: { kind: Prim; label: L10n }[] = [
      { kind: 'cylinder', label: l('زجاجة العطر', 'Perfume bottle') },
      { kind: 'cube', label: l('علبة المنتج', 'Product box') },
      { kind: 'sphere', label: l('الكرة الرئيسية', 'Hero sphere') },
    ];
    const pr = rng.pick(products);
    const doc: SceneDoc = {
      objects: [{ id: 'hero', kind: pr.kind, label: pr.label, x: rng.pick([-2, 2, 1.5]), z: rng.pick([-1.5, 1, 2]), scale: 1, rotY: 0, material: 'plastic', color: '#cccccc' }],
      light: { tone: 'neutral', intensity: 1, rim: false }, bg: '#20232c', nextId: 1,
    };
    const reqs: Omit<Requirement, 'id'>[] = [];
    reqs.push(mkReq('centered', { obj: 'hero' }, l(`ضع «${pr.label.ar}» في منتصف المشهد.`, `Place the ${pr.label.en} at the center of the scene.`), l('اضبط X و Z على 0.', 'Set X and Z to 0.')));
    const m = rng.pick(['metal', 'glass', 'marble', 'wood'] as Mat[]);
    reqs.push(mkReq('material', { obj: 'hero', material: m }, l(`طبّق خامة «${MAT_NAMES[m].ar}» على «${pr.label.ar}».`, `Apply a ${MAT_NAMES[m].en} material to the ${pr.label.en}.`), l('حدّد المجسم واختر الخامة.', 'Select the object and pick the material.')));
    const extraKind = rng.pick(PRIMS.filter((k) => k !== pr.kind && k !== 'torus'));
    const count = tier >= 3 ? 3 : 2;
    if (tier >= 2) {
      reqs.push(mkReq('addObjects', { kind: extraKind, count }, l(`أضف ${count} من «${PRIM_NAMES[extraKind].ar}» كعناصر ديكور حول المنتج.`, `Add ${count} ${PRIM_NAMES[extraKind].en} props around the product.`), l('من «إضافة» اختر الشكل وكرّر.', 'Use Add and repeat.')));
      const tone = rng.pick(['warm', 'cool'] as LightTone[]);
      reqs.push(mkReq('light', { tone }, l(`اجعل الإضاءة ${LIGHT_NAMES[tone].ar}.`, `Make the lighting ${LIGHT_NAMES[tone].en}.`), l('من لوحة الإضاءة اختر النغمة.', 'Pick the tone in the lighting panel.'), 0.7));
      reqs.push(mkReq('noIntersect', {}, l('لا تجعل المجسمات تتداخل مع بعضها.', 'Objects must not intersect each other.'), l('باعد بين المجسمات.', 'Spread the objects apart.'), 0.7));
    }
    if (tier >= 3) {
      const ratio = rng.pick([1.5, 2]);
      reqs.push(mkReq('scaleRatio', { obj: 'hero', kind: extraKind, ratio }, l(`اجعل حجم المنتج ${ratio === 2 ? 'ضعف' : '1.5 ضعف'} حجم عناصر الديكور.`, `Make the product ${ratio}× the size of the props.`), l('اضبط الحجم (Scale) للمنتج والديكور.', 'Adjust the Scale of product and props.'), 0.8));
      reqs.push(mkReq('rim', { on: true }, l('أضف إضاءة خلفية (Rim light) لإبراز الحواف.', 'Add a rim light to highlight the edges.'), l('فعّل «إضاءة خلفية».', 'Enable "Rim light".'), 0.6));
    }
    if (tier >= 4) {
      const deg = rng.pick([45, 90, 135]);
      reqs.push(mkReq('rotate', { obj: 'hero', deg }, l(`دوّر المنتج ${deg} درجة حول المحور العمودي.`, `Rotate the product ${deg}° around the vertical axis.`), l('عدّل قيمة الدوران.', 'Change the rotation value.'), 0.6));
      reqs.push(mkReq('inRadius', { r: 3 }, l('اجعل كل العناصر داخل دائرة نصف قطرها 3 حول المنتج.', 'Keep everything within radius 3 of the center.'), l('لا تبعد العناصر كثيرًا.', 'Do not spread too far.'), 0.6));
    }
    if (tier >= 5) {
      const c = rng.pick(COLORS.filter((x) => x.hex !== '#ffffff'));
      reqs.push(mkReq('colorKind', { kind: extraKind, color: c.hex }, l(`لوّن كل عناصر الديكور باللون ${c.name.ar}.`, `Color all props ${c.name.en}.`), l('حدّد كل عنصر وغيّر لونه.', 'Select each prop and change its color.'), 0.6));
      reqs.push(mkReq('materialKind', { kind: extraKind, material: 'glow' }, l('اجعل خامة عناصر الديكور «مضيئة».', 'Make the props use the Glow material.'), l('اختر خامة «مضيء» لكل عنصر.', 'Pick Glow for each prop.'), 0.6));
    }
    const kinds = [l('مشهد منتج ثلاثي الأبعاد', '3D product shot'), l('مجسم إعلاني', '3D ad scene'), l('عرض منتج', 'Product render')];
    const k = rng.pick(kinds);
    return { title: l(`${k.ar} لـ${ctx.brand.ar}`, `${k.en} for ${ctx.brand.en}`), doc, requirements: reqs };
  },

  check(doc: SceneDoc, r: Requirement) {
    const p = r.params;
    const o = doc.objects.find((x) => x.id === p.obj);
    switch (r.kind) {
      case 'centered': return { ok: !!o && near(o.x, 0, 0.3) && near(o.z, 0, 0.3) };
      case 'material': return { ok: !!o && o.material === p.material };
      case 'addObjects': return { ok: doc.objects.filter((x) => x.kind === p.kind && x.id !== 'hero').length >= p.count };
      case 'light': return { ok: doc.light.tone === p.tone };
      case 'rim': return { ok: doc.light.rim === !!p.on };
      case 'noIntersect': {
        for (let i = 0; i < doc.objects.length; i++)
          for (let j = i + 1; j < doc.objects.length; j++) {
            const a = doc.objects[i], b = doc.objects[j];
            if (Math.hypot(a.x - b.x, a.z - b.z) < radiusOf(a) + radiusOf(b) - 0.05) return { ok: false };
          }
        return { ok: true };
      }
      case 'scaleRatio': {
        const props = doc.objects.filter((x) => x.kind === p.kind && x.id !== 'hero');
        return { ok: !!o && props.length > 0 && props.every((x) => near(o.scale, x.scale * p.ratio, 0.13)) };
      }
      case 'rotate': return { ok: !!o && near(((o.rotY % 360) + 360) % 360, p.deg, 4) };
      case 'inRadius': return { ok: doc.objects.every((x) => Math.hypot(x.x, x.z) <= p.r + 0.01) };
      case 'colorKind': { const xs = doc.objects.filter((x) => x.kind === p.kind && x.id !== 'hero'); return { ok: xs.length > 0 && xs.every((x) => sameColor(x.color, p.color)) }; }
      case 'materialKind': { const xs = doc.objects.filter((x) => x.kind === p.kind && x.id !== 'hero'); return { ok: xs.length > 0 && xs.every((x) => x.material === p.material) }; }
      case 'heroColor': return { ok: !!o && sameColor(o.color, p.color) };
    }
    return { ok: false };
  },

  tweak(rng, doc: SceneDoc, existing) {
    if (!existing.some((r) => r.kind === 'light')) {
      const tone = rng.pick(['warm', 'cool'] as LightTone[]);
      return mkReq('light', { tone }, l(`نفضّل إضاءة ${LIGHT_NAMES[tone].ar}.`, `We prefer ${LIGHT_NAMES[tone].en} lighting.`), l('غيّر نغمة الإضاءة.', 'Change the light tone.'), 0.6);
    }
    if (!existing.some((r) => r.kind === 'heroColor')) {
      const c = rng.pick(COLORS);
      return mkReq('heroColor', { obj: 'hero', color: c.hex }, l(`غيّر لون المنتج إلى ${c.name.ar}.`, `Change the product color to ${c.name.en}.`), l('حدّد المنتج وغيّر لونه.', 'Select the product and change its color.'), 0.6);
    }
    return null;
  },

  sanitize(d: any): SceneDoc {
    const objects = arr(d?.objects, 24).map((o: any) => ({
      id: str(o.id, 20), kind: (PRIMS.includes(o.kind) ? o.kind : 'cube') as Prim, label: { ar: str(o.label?.ar, 40), en: str(o.label?.en, 40) },
      x: num(o.x, 0, -10, 10), z: num(o.z, 0, -10, 10), scale: num(o.scale, 1, 0.1, 5), rotY: num(o.rotY, 0, -720, 720),
      material: (MATS.includes(o.material) ? o.material : 'plastic') as Mat, color: str(o.color, 9),
    }));
    const tone = (['neutral', 'warm', 'cool'].includes(d?.light?.tone) ? d.light.tone : 'neutral') as LightTone;
    return { objects, light: { tone, intensity: num(d?.light?.intensity, 1, 0, 3), rim: !!d?.light?.rim }, bg: str(d?.bg, 9), nextId: num(d?.nextId, 1, 0, 1e6) };
  },
};

export const sceneOps = {
  set(doc: SceneDoc, id: string, patch: Partial<SObject>): SceneDoc { return { ...doc, objects: doc.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }; },
  add(doc: SceneDoc, kind: Prim): SceneDoc {
    const id = `o${doc.nextId}`;
    const ang = doc.nextId * 1.9;
    const o: SObject = { id, kind, label: PRIM_NAMES[kind], x: Math.round(Math.cos(ang) * 2.5 * 2) / 2, z: Math.round(Math.sin(ang) * 2.5 * 2) / 2, scale: 1, rotY: 0, material: 'plastic', color: '#e0e0e0' };
    return { ...doc, objects: [...doc.objects, o], nextId: doc.nextId + 1 };
  },
  remove(doc: SceneDoc, id: string): SceneDoc { return id === 'hero' ? doc : { ...doc, objects: doc.objects.filter((o) => o.id !== id) }; },
  light(doc: SceneDoc, patch: Partial<SceneDoc['light']>): SceneDoc { return { ...doc, light: { ...doc.light, ...patch } }; },
};
