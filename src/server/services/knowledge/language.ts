import type { Language } from '../../ai/types';

/** Arabic script share decides between Arabic and English for now. More languages add entries. */
export function detectLanguage(text: string): Language {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (!letters) return 'en';
  const arabic = text.match(/[؀-ۿݐ-ݿࢠ-ࣿ]/g)?.length ?? 0;
  return arabic / letters > 0.3 ? 'ar' : 'en';
}

/** The Postgres text search configuration for a language. Unknown languages use `simple`. */
export const searchConfig = (language: Language) =>
  language === 'en' ? 'english' : language === 'ar' ? 'arabic' : 'simple';
