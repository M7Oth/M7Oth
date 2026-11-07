import type { L10n, Lang } from '@fls/shared';
import { useGame } from './store';

export function useLang(): Lang { return useGame((s) => s.settings.lang); }

/** Inline bilingual strings: T('عربي', 'English') */
export function useT() {
  const lang = useLang();
  return (ar: string, en: string) => (lang === 'ar' ? ar : en);
}

export function useL() {
  const lang = useLang();
  return (x: L10n | undefined | null) => (x ? x[lang] ?? x.ar : '');
}

export function applyDir(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
