import type { L10n, Requirement, SpecialtyId } from '../types';
import type { Rng } from '../rng';

export interface GenContext {
  brand: L10n;      // client name
  tier: number;     // 1..5 difficulty tier for this task
  index: number;    // task index inside project
}

export interface Generated {
  title: L10n;
  doc: any;
  requirements: Omit<Requirement, 'id'>[];
}

export interface CheckResult { ok: boolean; detail?: string }

export interface WorkModule {
  specialty: SpecialtyId;
  generate(rng: Rng, ctx: GenContext): Generated;
  check(doc: any, req: Requirement, all: Requirement[]): CheckResult;
  /** a small, reasonable extra change the client may ask for during a revision */
  tweak(rng: Rng, doc: any, existing: Requirement[]): Omit<Requirement, 'id'> | null;
  /** coerce untrusted docs coming from clients into a safe shape */
  sanitize(doc: any): any;
}

export const mkReq = (kind: string, params: Record<string, any>, text: L10n, hint: L10n, weight = 1): Omit<Requirement, 'id'> =>
  ({ kind, params, text, hint, weight });

export const num = (v: any, d = 0, lo = -1e6, hi = 1e6) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
};
export const str = (v: any, max = 200) => String(v ?? '').slice(0, max);
export const arr = (v: any, max = 60): any[] => (Array.isArray(v) ? v.slice(0, max) : []);

export interface NamedColor { hex: string; name: L10n }
export const COLORS: NamedColor[] = [
  { hex: '#ffffff', name: { ar: 'الأبيض', en: 'white' } },
  { hex: '#111111', name: { ar: 'الأسود', en: 'black' } },
  { hex: '#d4a017', name: { ar: 'الذهبي', en: 'gold' } },
  { hex: '#e23b3b', name: { ar: 'الأحمر', en: 'red' } },
  { hex: '#2f6fdf', name: { ar: 'الأزرق', en: 'blue' } },
  { hex: '#22a06b', name: { ar: 'الأخضر', en: 'green' } },
  { hex: '#1b2a4a', name: { ar: 'الكحلي', en: 'navy' } },
  { hex: '#f5ecd7', name: { ar: 'الكريمي', en: 'cream' } },
  { hex: '#f08a24', name: { ar: 'البرتقالي', en: 'orange' } },
  { hex: '#7b4fd8', name: { ar: 'البنفسجي', en: 'purple' } },
];
export const colorName = (hex: string): L10n => COLORS.find((c) => c.hex === hex)?.name ?? { ar: hex, en: hex };
export const sameColor = (a: any, b: any) => String(a).toLowerCase() === String(b).toLowerCase();

export const SLOGANS: L10n[] = [
  { ar: 'جودة تستحقها', en: 'Quality you deserve' },
  { ar: 'اطلب الآن', en: 'Order now' },
  { ar: 'خصم 30%', en: '30% off' },
  { ar: 'افتتاح قريب', en: 'Opening soon' },
  { ar: 'صنع بحب', en: 'Made with love' },
  { ar: 'انضم إلينا', en: 'Join us' },
  { ar: 'تجربة لا تنسى', en: 'Unforgettable' },
  { ar: 'الأفضل في المدينة', en: 'Best in town' },
];
