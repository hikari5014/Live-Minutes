// Server-side language map (DeepL codes). Mirror of src/lib/langs.ts subset.
export interface LangRow {
  deepl: string
  deeplSource: string
  deepgram: string
}

export const LANGS: Record<string, LangRow> = {
  zh: { deepl: 'ZH-HANT', deeplSource: 'ZH', deepgram: 'zh-TW' },
  en: { deepl: 'EN-US', deeplSource: 'EN', deepgram: 'en-US' },
  ja: { deepl: 'JA', deeplSource: 'JA', deepgram: 'ja' },
  ko: { deepl: 'KO', deeplSource: 'KO', deepgram: 'ko' },
  de: { deepl: 'DE', deeplSource: 'DE', deepgram: 'de' },
  fr: { deepl: 'FR', deeplSource: 'FR', deepgram: 'fr' },
  es: { deepl: 'ES', deeplSource: 'ES', deepgram: 'es' },
}
