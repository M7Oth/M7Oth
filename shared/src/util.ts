import type { L10n } from './types';

export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 1440;
export const DAYS_PER_WEEK = 7;

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const round2 = (v: number) => Math.round(v * 100) / 100;
export const l = (ar: string, en: string): L10n => ({ ar, en });

export function dayOf(time: number) { return Math.floor(time / MIN_PER_DAY) + 1; }
export function clockOf(time: number) {
  const m = ((time % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const hh = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatSAR(v: number, lang: 'ar' | 'en' = 'ar') {
  const n = Math.round(v).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US');
  return lang === 'ar' ? `${n} ر.س` : `SAR ${n}`;
}

export function normText(s: string) {
  return String(s ?? '')
    .trim()
    .replace(/[ً-ْ]/g, '') // Arabic diacritics
    .replace(/[إأآ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;
