import type { L10n, Requirement } from '../types';
import type { Rng } from '../rng';
import { l, near, normText } from '../util';
import { arr, COLORS, colorName, mkReq, num, sameColor, SLOGANS, str, type WorkModule } from './common';

export interface VMedia { id: string; label: L10n; color: string; length: number; broll?: boolean }
export interface VClip { id: string; mediaId: string; srcIn: number; srcOut: number; grade: string; transOut: string }
export interface VText { id: string; content: string; start: number; end: number; color: string; position: 'top' | 'center' | 'bottom' }
export interface VAudio { id: string; trackId: string; start: number; end: number; volume: number }
export interface VOverlay { id: string; mediaId: string; start: number; end: number }
export interface VideoDoc { media: VMedia[]; clips: VClip[]; texts: VText[]; audio: VAudio[]; overlays: VOverlay[]; nextId: number }

export const GRADES = ['none', 'warm', 'cool', 'bw', 'vivid'] as const;
export const GRADE_NAMES: Record<string, L10n> = {
  none: l('بدون', 'None'), warm: l('دافئ', 'Warm'), cool: l('بارد', 'Cool'), bw: l('أبيض وأسود', 'B&W'), vivid: l('حيوي', 'Vivid'),
};
export const TRANSITIONS = ['none', 'fade', 'dissolve', 'wipe'] as const;
export const TRANSITION_NAMES: Record<string, L10n> = {
  none: l('قطع مباشر', 'Cut'), fade: l('تلاشي', 'Fade'), dissolve: l('ذوبان', 'Dissolve'), wipe: l('مسح', 'Wipe'),
};
export const TRACKS: { id: string; name: L10n }[] = [
  { id: 'calm', name: l('هادئة', 'Calm') },
  { id: 'upbeat', name: l('حماسية', 'Upbeat') },
  { id: 'epic', name: l('ملحمية', 'Epic') },
  { id: 'lofi', name: l('لو-فاي', 'Lo-fi') },
];

const MEDIA_BANK: L10n[] = [
  l('لقطة الافتتاح', 'Opening shot'), l('المنتج عن قرب', 'Product close-up'), l('فريق العمل', 'The team'),
  l('ابتسامة العميل', 'Happy customer'), l('لقطة جوية', 'Aerial shot'), l('تجهيز الطلب', 'Preparing the order'),
  l('الجمهور', 'The crowd'), l('مقابلة قصيرة', 'Short interview'), l('واجهة المحل', 'Storefront'), l('لقطة الختام', 'Closing shot'),
  l('كواليس التصوير', 'Behind the scenes'), l('تفاصيل المكان', 'Venue details'),
];
const MEDIA_COLORS = ['#e76f51', '#2a9d8f', '#e9c46a', '#8ab17d', '#6c8ebf', '#b56576', '#f4a261', '#5e60ce', '#43aa8b', '#c9ada7'];

export function clipLen(c: VClip) { return Math.max(0, c.srcOut - c.srcIn); }
export function timelineDuration(doc: VideoDoc) { return doc.clips.reduce((s, c) => s + clipLen(c), 0); }
export function clipStarts(doc: VideoDoc) {
  const out: number[] = [];
  let t = 0;
  for (const c of doc.clips) { out.push(t); t += clipLen(c); }
  return out;
}
const fmt = (s: number) => (Math.round(s * 10) / 10).toString();

/** Media expected to remain after all removal requirements (seconds per media). */
function expectedKept(doc0Media: VMedia[], reqs: Requirement[] | Omit<Requirement, 'id'>[]) {
  const kept: Record<string, number> = {};
  for (const m of doc0Media) if (!m.broll) kept[m.id] = m.length;
  for (const r of reqs) {
    if (r.kind === 'removeClip') kept[r.params.mediaId] = 0;
    if (r.kind === 'removeRange') kept[r.params.mediaId] = (kept[r.params.mediaId] ?? 0) - (r.params.to - r.params.from);
    if (r.kind === 'trimTo') kept[r.params.mediaId] = Math.min(kept[r.params.mediaId] ?? 0, r.params.keep);
  }
  return kept;
}

function keptByMedia(doc: VideoDoc) {
  const k: Record<string, number> = {};
  for (const c of doc.clips) k[c.mediaId] = (k[c.mediaId] ?? 0) + clipLen(c);
  return k;
}

export const videoModule: WorkModule = {
  specialty: 'video',

  generate(rng: Rng, ctx) {
    const tier = ctx.tier;
    const count = Math.min(6, 3 + Math.floor(tier / 2) + rng.int(0, 1));
    const labels = rng.shuffle([...MEDIA_BANK]);
    const colors = rng.shuffle([...MEDIA_COLORS]);
    const media: VMedia[] = [];
    for (let i = 0; i < count; i++) {
      media.push({ id: `m${i + 1}`, label: labels[i], color: colors[i % colors.length], length: rng.int(4, 6 + tier) });
    }
    if (tier >= 4) media.push({ id: 'b1', label: labels[count], color: colors[(count) % colors.length], length: 6, broll: true });
    const clips: VClip[] = media.filter((m) => !m.broll).map((m, i) => ({ id: `c${i + 1}`, mediaId: m.id, srcIn: 0, srcOut: m.length, grade: 'none', transOut: 'none' }));
    const doc: VideoDoc = { media, clips, texts: [], audio: [], overlays: [], nextId: 100 };

    const reqs: Omit<Requirement, 'id'>[] = [];
    const used = new Set<string>();
    const free = () => media.filter((m) => !m.broll && !used.has(m.id));
    const starts = clipStarts(doc);
    const startOf = (mid: string) => starts[clips.findIndex((c) => c.mediaId === mid)];

    const addRemoveRange = () => {
      const cands = free().filter((m) => m.length >= 6);
      if (!cands.length) return;
      const m = rng.pick(cands); used.add(m.id);
      const len = rng.int(2, Math.min(3, m.length - 3));
      const from = rng.int(1, m.length - len - 1);
      const t0 = startOf(m.id) + from, t1 = t0 + len;
      reqs.push(mkReq('removeRange', { mediaId: m.id, from, to: from + len, t0, t1 },
        l(`احذف اللقطة من الثانية ${t0} إلى الثانية ${t1} (داخل «${m.label.ar}»).`, `Remove the footage from second ${t0} to second ${t1} (inside "${m.label.en}").`),
        l(`ضع رأس التشغيل على ${t0} واضغط «قص»، ثم على ${t1} واضغط «قص»، ثم حدّد الجزء الأوسط واحذفه.`, `Put the playhead at ${t0}, press Split, then at ${t1} press Split, select the middle part and delete it.`)));
    };
    const addRemoveClip = () => {
      const cands = free();
      if (cands.length < 3) return;
      const m = rng.pick(cands); used.add(m.id);
      reqs.push(mkReq('removeClip', { mediaId: m.id },
        l(`احذف لقطة «${m.label.ar}» بالكامل.`, `Delete the "${m.label.en}" clip entirely.`),
        l('حدّد اللقطة في التايملاين واضغط «حذف».', 'Select the clip in the timeline and press Delete.')));
    };
    const addOrder = () => {
      const idx = clips.map((c, i) => i).filter((i) => i + 1 < clips.length && !used.has(clips[i].mediaId) && !used.has(clips[i + 1].mediaId));
      if (!idx.length) return;
      const i = rng.pick(idx);
      const a = media.find((m) => m.id === clips[i].mediaId)!, b = media.find((m) => m.id === clips[i + 1].mediaId)!;
      used.add(a.id); used.add(b.id);
      reqs.push(mkReq('order', { before: b.id, after: a.id },
        l(`غيّر ترتيب اللقطتين: اجعل «${b.label.ar}» قبل «${a.label.ar}».`, `Swap the clips: put "${b.label.en}" before "${a.label.en}".`),
        l('اسحب اللقطة إلى مكانها الجديد أو استخدم أزرار التحريك ◀ ▶.', 'Drag the clip to its new place or use the ◀ ▶ move buttons.')));
    };
    const addTrim = () => {
      const last = clips[clips.length - 1];
      const m = media.find((x) => x.id === last.mediaId)!;
      if (used.has(m.id) || m.length < 5) return;
      used.add(m.id);
      const keep = rng.int(2, m.length - 2);
      reqs.push(mkReq('trimTo', { mediaId: m.id, keep },
        l(`قصّر «${m.label.ar}» لتصبح ${keep} ثوانٍ فقط من بدايتها.`, `Shorten "${m.label.en}" to its first ${keep} seconds.`),
        l(`ضع رأس التشغيل بعد ${keep} ثوانٍ من بداية اللقطة، اقطع، ثم احذف الجزء الأخير.`, `Place the playhead ${keep}s into the clip, split, then delete the tail.`)));
    };
    const finalDur = () => {
      const k = expectedKept(media, reqs);
      return Object.values(k).reduce((s, v) => s + Math.max(0, v), 0);
    };
    let textContent: L10n | null = null;
    const addText = () => {
      const dur = Math.floor(finalDur());
      if (dur < 8) return;
      const slogan = rng.pick(SLOGANS);
      textContent = slogan;
      const from = rng.int(1, Math.max(1, dur - 6));
      const to = Math.min(dur - 1, from + rng.int(3, 5));
      reqs.push(mkReq('addText', { content: slogan, from, to },
        l(`أضف النص «${slogan.ar}» من الثانية ${from} إلى الثانية ${to}.`, `Add the text "${slogan.en}" from second ${from} to second ${to}.`),
        l('اضغط «نص» ثم اكتب النص وحدّد وقت البداية والنهاية. التوقيت حسب التايملاين النهائي.', 'Press Text, type it and set start/end times. Times refer to the final timeline.')));
    };
    const addTextStyle = () => {
      if (!textContent) return;
      if (rng.chance(0.5)) {
        const c = rng.pick(COLORS.filter((x) => x.hex !== '#ffffff'));
        reqs.push(mkReq('textColor', { content: textContent, color: c.hex },
          l(`اجعل لون النص «${textContent.ar}» ${c.name.ar}.`, `Make the text "${textContent.en}" ${c.name.en}.`),
          l('حدّد طبقة النص وغيّر اللون من لوحة الخصائص.', 'Select the text layer and change its color in the properties panel.'), 0.6));
      } else {
        const pos = rng.pick(['top', 'bottom'] as const);
        const pn = pos === 'top' ? l('أعلى', 'top') : l('أسفل', 'bottom');
        reqs.push(mkReq('textPosition', { content: textContent, position: pos },
          l(`ضع النص «${textContent.ar}» في ${pn.ar} الشاشة.`, `Place the text "${textContent.en}" at the ${pn.en} of the screen.`),
          l('حدّد طبقة النص واختر الموضع.', 'Select the text layer and choose its position.'), 0.6));
      }
    };
    const addTransition = () => {
      const removed = new Set(reqs.filter((r) => r.kind === 'removeClip').map((r) => r.params.mediaId));
      const remaining = clips.filter((c) => !removed.has(c.mediaId));
      const cands = remaining.slice(0, -1).filter((c) => !reqs.some((r) => r.kind === 'removeClip' && r.params.mediaId === c.mediaId) && !reqs.some((r) => r.kind === 'order' && (r.params.before === c.mediaId || r.params.after === c.mediaId)));
      if (!cands.length) return;
      const c = rng.pick(cands);
      const m = media.find((x) => x.id === c.mediaId)!;
      const kind = rng.pick(['fade', 'dissolve', 'wipe']);
      reqs.push(mkReq('transition', { mediaId: m.id, kind },
        l(`أضف انتقال «${TRANSITION_NAMES[kind].ar}» بعد لقطة «${m.label.ar}».`, `Add a "${TRANSITION_NAMES[kind].en}" transition after "${m.label.en}".`),
        l('حدّد اللقطة واختر الانتقال من قائمة الانتقالات.', 'Select the clip and choose a transition.')));
    };
    const addMusic = () => {
      const t = rng.pick(TRACKS);
      const maxVol = rng.pick([40, 50, 60]);
      reqs.push(mkReq('music', { trackId: t.id, maxVolume: maxVol },
        l(`أضف موسيقى «${t.name.ar}» على طول الفيديو بمستوى صوت لا يتجاوز ${maxVol}%.`, `Add "${t.name.en}" music across the whole video at volume ≤ ${maxVol}%.`),
        l('من مكتبة الصوت أضف المقطع، سيمتد تلقائيًا على كامل الفيديو، ثم اخفض الصوت.', 'Add the track from the audio library (it spans the video), then lower the volume.')));
    };
    const addGrade = () => {
      const cands = free();
      if (!cands.length) return;
      const m = rng.pick(cands); used.add(m.id);
      const g = rng.pick(['warm', 'cool', 'bw', 'vivid']);
      reqs.push(mkReq('grade', { mediaId: m.id, grade: g },
        l(`طبّق تصحيح ألوان «${GRADE_NAMES[g].ar}» على «${m.label.ar}».`, `Apply the "${GRADE_NAMES[g].en}" color grade to "${m.label.en}".`),
        l('حدّد اللقطة واختر التصحيح من قسم الألوان.', 'Select the clip and pick a grade in the Color section.')));
    };
    const addOverlay = () => {
      const b = media.find((m) => m.broll);
      if (!b) return;
      const dur = Math.floor(finalDur());
      const from = rng.int(2, Math.max(2, dur - 5));
      const to = from + 3;
      reqs.push(mkReq('overlay', { mediaId: b.id, from, to },
        l(`ضع لقطة «${b.label.ar}» كطبقة علوية (V2) من الثانية ${from} إلى ${to}.`, `Place "${b.label.en}" as an overlay (V2) from second ${from} to ${to}.`),
        l('من مكتبة اللقطات اختر «طبقة علوية» ثم حدّد التوقيت.', 'From the media bin choose "Overlay" and set its timing.')));
    };

    const plan: (() => void)[] = [];
    plan.push(rng.chance(0.6) ? addRemoveRange : addRemoveClip);
    plan.push(addOrder);
    if (tier >= 2 && rng.chance(0.5)) plan.push(addTrim);
    if (tier >= 4) plan.push(addGrade);
    if (tier >= 5) { plan.push(addRemoveRange); plan.push(addRemoveClip); }
    if (tier >= 2) { plan.push(addText); plan.push(addTextStyle); }
    if (tier >= 3) { plan.push(addTransition); plan.push(addMusic); }
    if (tier >= 4) plan.push(addOverlay);
    for (const p of plan) p();
    if (reqs.length === 0) addRemoveClip();
    reqs.push(mkReq('preserve', {},
      l('حافظ على بقية اللقطات دون حذف أجزاء غير مطلوبة.', 'Keep the rest of the footage; do not cut anything that was not requested.'),
      l('لا تحذف إلا ما طلبه العميل.', 'Only delete what the client asked for.'), 0.5));

    const kinds = [l('إعلان', 'Ad'), l('ريلز', 'Reel'), l('فيديو تعريفي', 'Promo video'), l('فيديو يوتيوب', 'YouTube video'), l('فيديو فعالية', 'Event recap')];
    const k = rng.pick(kinds);
    const total = Math.round(timelineDuration(doc));
    return { title: l(`مونتاج ${k.ar} (${total} ثانية)`, `Edit ${k.en} (${total}s)`), doc, requirements: reqs };
  },

  check(doc: VideoDoc, r: Requirement, all: Requirement[]) {
    const p = r.params;
    const T = 0.35;
    switch (r.kind) {
      case 'removeRange': {
        let overlap = 0;
        for (const c of doc.clips) if (c.mediaId === p.mediaId) overlap += Math.max(0, Math.min(c.srcOut, p.to) - Math.max(c.srcIn, p.from));
        return { ok: overlap <= T, detail: `overlap ${fmt(overlap)}s` };
      }
      case 'removeClip':
        return { ok: !doc.clips.some((c) => c.mediaId === p.mediaId) };
      case 'trimTo': {
        const cs = doc.clips.filter((c) => c.mediaId === p.mediaId);
        const total = cs.reduce((s, c) => s + clipLen(c), 0);
        const startsAt0 = cs.length > 0 && Math.min(...cs.map((c) => c.srcIn)) <= T;
        return { ok: startsAt0 && near(total, p.keep, T), detail: `${fmt(total)}s` };
      }
      case 'order': {
        const ib = doc.clips.findIndex((c) => c.mediaId === p.before);
        const ia = doc.clips.findIndex((c) => c.mediaId === p.after);
        return { ok: ib >= 0 && ia >= 0 && ib < ia };
      }
      case 'addText': {
        const ok = doc.texts.some((t) => (normText(t.content) === normText(p.content.ar) || normText(t.content) === normText(p.content.en)) && near(t.start, p.from, T) && near(t.end, p.to, T));
        return { ok };
      }
      case 'textColor': {
        const ts = doc.texts.filter((t) => normText(t.content) === normText(p.content.ar) || normText(t.content) === normText(p.content.en));
        return { ok: ts.length > 0 && ts.every((t) => sameColor(t.color, p.color)) };
      }
      case 'allTextColor':
        return { ok: doc.texts.length > 0 && doc.texts.every((t) => sameColor(t.color, p.color)) };
      case 'textPosition': {
        const ts = doc.texts.filter((t) => normText(t.content) === normText(p.content.ar) || normText(t.content) === normText(p.content.en));
        return { ok: ts.length > 0 && ts.every((t) => t.position === p.position) };
      }
      case 'transition': {
        let idx = -1;
        doc.clips.forEach((c, i) => { if (c.mediaId === p.mediaId) idx = i; });
        return { ok: idx >= 0 && idx < doc.clips.length - 1 && doc.clips[idx].transOut === p.kind };
      }
      case 'music': {
        const dur = timelineDuration(doc);
        return { ok: doc.audio.some((a) => a.trackId === p.trackId && a.start <= T && a.end >= dur - T && a.volume <= p.maxVolume) };
      }
      case 'grade': {
        const cs = doc.clips.filter((c) => c.mediaId === p.mediaId);
        return { ok: cs.length > 0 && cs.every((c) => c.grade === p.grade) };
      }
      case 'overlay':
        return { ok: doc.overlays.some((o) => o.mediaId === p.mediaId && near(o.start, p.from, T) && near(o.end, p.to, T)) };
      case 'preserve': {
        const exp = expectedKept(doc.media, all);
        const kept = keptByMedia(doc);
        for (const id of Object.keys(exp)) {
          const want = Math.max(0, exp[id]);
          const have = kept[id] ?? 0;
          if (have < want - 0.6) return { ok: false, detail: id };
        }
        // no source segment duplicated
        for (const m of doc.media) {
          const cs = doc.clips.filter((c) => c.mediaId === m.id).sort((a, b) => a.srcIn - b.srcIn);
          for (let i = 1; i < cs.length; i++) if (cs[i].srcIn < cs[i - 1].srcOut - 0.05) return { ok: false, detail: 'dup' };
        }
        return { ok: true };
      }
    }
    return { ok: false, detail: 'unknown' };
  },

  tweak(rng, doc: VideoDoc, existing) {
    const options: (() => Omit<Requirement, 'id'> | null)[] = [
      () => doc.texts.length && !existing.some((r) => r.kind === 'allTextColor')
        ? mkReq('allTextColor', { color: '#ffffff' }, l('غيّر لون النص إلى الأبيض.', 'Change the text color to white.'), l('حدّد كل طبقة نص واجعل لونها أبيض.', 'Select each text layer and make it white.'), 0.6)
        : null,
      () => {
        const referenced = new Set(existing.flatMap((r) => [r.params.mediaId, r.params.before, r.params.after]).filter(Boolean));
        const last = doc.clips[doc.clips.length - 1];
        if (!last || referenced.has(last.mediaId) || doc.clips.length < 3) return null;
        const m = doc.media.find((x) => x.id === last.mediaId)!;
        return mkReq('removeClip', { mediaId: m.id }, l(`احذف اللقطة الأخيرة «${m.label.ar}».`, `Delete the last clip "${m.label.en}".`), l('حدّد آخر لقطة واحذفها.', 'Select the last clip and delete it.'), 0.8);
      },
      () => {
        const referenced = new Set(existing.filter((r) => r.kind === 'transition').map((r) => r.params.mediaId));
        const c = doc.clips.slice(0, -1).find((x) => !referenced.has(x.mediaId) && !existing.some((r) => r.params.mediaId === x.mediaId));
        if (!c) return null;
        const m = doc.media.find((x) => x.id === c.mediaId)!;
        return mkReq('transition', { mediaId: m.id, kind: 'fade' }, l(`أضف انتقال تلاشي بعد «${m.label.ar}».`, `Add a fade after "${m.label.en}".`), l('حدّد اللقطة واختر «تلاشي».', 'Select the clip and pick Fade.'), 0.6);
      },
    ];
    for (const o of rng.shuffle(options)) { const r = o(); if (r) return r; }
    return null;
  },

  sanitize(d: any): VideoDoc {
    const media = arr(d?.media, 12).map((m: any) => ({ id: str(m.id, 10), label: { ar: str(m.label?.ar, 60), en: str(m.label?.en, 60) }, color: str(m.color, 9), length: num(m.length, 5, 0, 60), broll: !!m.broll }));
    const clips = arr(d?.clips, 80).map((c: any) => {
      const srcIn = num(c.srcIn, 0, 0, 60);
      return { id: str(c.id, 12), mediaId: str(c.mediaId, 10), srcIn, srcOut: Math.max(srcIn, num(c.srcOut, srcIn, 0, 60)), grade: str(c.grade, 10), transOut: str(c.transOut, 10) };
    });
    const texts = arr(d?.texts, 20).map((t: any) => ({ id: str(t.id, 12), content: str(t.content, 80), start: num(t.start, 0, 0, 600), end: num(t.end, 0, 0, 600), color: str(t.color, 9), position: (['top', 'center', 'bottom'].includes(t.position) ? t.position : 'center') as VText['position'] }));
    const audio = arr(d?.audio, 6).map((a: any) => ({ id: str(a.id, 12), trackId: str(a.trackId, 12), start: num(a.start, 0, 0, 600), end: num(a.end, 0, 0, 600), volume: num(a.volume, 100, 0, 100) }));
    const overlays = arr(d?.overlays, 10).map((o: any) => ({ id: str(o.id, 12), mediaId: str(o.mediaId, 10), start: num(o.start, 0, 0, 600), end: num(o.end, 0, 0, 600) }));
    return { media, clips, texts, audio, overlays, nextId: num(d?.nextId, 100, 0, 1e6) };
  },
};

// ---------- Editing operations (used by the editor UI and by tests) ----------
export const videoOps = {
  split(doc: VideoDoc, t: number): VideoDoc {
    const starts = clipStarts(doc);
    const i = doc.clips.findIndex((c, k) => t > starts[k] + 0.05 && t < starts[k] + clipLen(c) - 0.05);
    if (i < 0) return doc;
    const c = doc.clips[i];
    const cut = c.srcIn + (t - starts[i]);
    const a: VClip = { ...c, srcOut: cut, transOut: 'none' };
    const b: VClip = { ...c, id: `c${doc.nextId}`, srcIn: cut };
    const clips = [...doc.clips];
    clips.splice(i, 1, a, b);
    return { ...doc, clips, nextId: doc.nextId + 1 };
  },
  remove(doc: VideoDoc, clipId: string): VideoDoc { return { ...doc, clips: doc.clips.filter((c) => c.id !== clipId) }; },
  move(doc: VideoDoc, clipId: string, toIndex: number): VideoDoc {
    const clips = [...doc.clips];
    const i = clips.findIndex((c) => c.id === clipId);
    if (i < 0) return doc;
    const [c] = clips.splice(i, 1);
    clips.splice(Math.max(0, Math.min(clips.length, toIndex)), 0, c);
    return { ...doc, clips };
  },
  addText(doc: VideoDoc, content: string, start: number, end: number, color = '#ffffff', position: VText['position'] = 'center'): VideoDoc {
    return { ...doc, texts: [...doc.texts, { id: `t${doc.nextId}`, content, start, end, color, position }], nextId: doc.nextId + 1 };
  },
  updateText(doc: VideoDoc, id: string, patch: Partial<VText>): VideoDoc { return { ...doc, texts: doc.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }; },
  removeText(doc: VideoDoc, id: string): VideoDoc { return { ...doc, texts: doc.texts.filter((t) => t.id !== id) }; },
  setClip(doc: VideoDoc, id: string, patch: Partial<VClip>): VideoDoc { return { ...doc, clips: doc.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }; },
  addAudio(doc: VideoDoc, trackId: string): VideoDoc {
    return { ...doc, audio: [...doc.audio.filter((a) => a.trackId !== trackId), { id: `a${doc.nextId}`, trackId, start: 0, end: timelineDuration(doc), volume: 100 }], nextId: doc.nextId + 1 };
  },
  setAudio(doc: VideoDoc, id: string, patch: Partial<VAudio>): VideoDoc { return { ...doc, audio: doc.audio.map((a) => (a.id === id ? { ...a, ...patch } : a)) }; },
  removeAudio(doc: VideoDoc, id: string): VideoDoc { return { ...doc, audio: doc.audio.filter((a) => a.id !== id) }; },
  addOverlay(doc: VideoDoc, mediaId: string, start: number, end: number): VideoDoc {
    return { ...doc, overlays: [...doc.overlays, { id: `o${doc.nextId}`, mediaId, start, end }], nextId: doc.nextId + 1 };
  },
  setOverlay(doc: VideoDoc, id: string, patch: Partial<VOverlay>): VideoDoc { return { ...doc, overlays: doc.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) }; },
  removeOverlay(doc: VideoDoc, id: string): VideoDoc { return { ...doc, overlays: doc.overlays.filter((o) => o.id !== id) }; },
  /** keep audio spanning the timeline after cuts */
  fitAudio(doc: VideoDoc): VideoDoc {
    const dur = timelineDuration(doc);
    return { ...doc, audio: doc.audio.map((a) => (a.end > dur || a.end >= dur - 0.5 ? { ...a, end: dur } : a)) };
  },
};
export const colorLabel = colorName;
