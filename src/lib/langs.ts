import type { LangCode, LangOption, TargetLang } from './types'

// Language table. DeepL 繁中目標碼為 ZH-HANT；Deepgram 使用 nova-2/3 語言碼。
export const LANGS: Record<LangCode, LangOption> = {
  zh: { code: 'zh', label: '中文（繁體）', native: '繁體中文', deepl: 'ZH-HANT', deeplSource: 'ZH', deepgram: 'zh-TW', bcp47: 'zh-TW' },
  en: { code: 'en', label: '英文', native: 'English', deepl: 'EN-US', deeplSource: 'EN', deepgram: 'en-US', bcp47: 'en-US' },
  ja: { code: 'ja', label: '日文', native: '日本語', deepl: 'JA', deeplSource: 'JA', deepgram: 'ja', bcp47: 'ja-JP' },
  ko: { code: 'ko', label: '韓文', native: '한국어', deepl: 'KO', deeplSource: 'KO', deepgram: 'ko', bcp47: 'ko-KR' },
  de: { code: 'de', label: '德文', native: 'Deutsch', deepl: 'DE', deeplSource: 'DE', deepgram: 'de', bcp47: 'de-DE' },
  fr: { code: 'fr', label: '法文', native: 'Français', deepl: 'FR', deeplSource: 'FR', deepgram: 'fr', bcp47: 'fr-FR' },
  es: { code: 'es', label: '西班牙文', native: 'Español', deepl: 'ES', deeplSource: 'ES', deepgram: 'es', bcp47: 'es-ES' },
}

export const LANG_LIST: LangOption[] = Object.values(LANGS)

export function langLabel(code: LangCode): string {
  return LANGS[code].label
}

export function targetLabel(target: TargetLang): string {
  return target === 'none' ? '不翻譯' : LANGS[target].label
}

// 語者顏色（對應 index.css 的 --s1..--s6）
export function speakerColor(speaker: number | null): string {
  if (speaker === null) return 'var(--muted)'
  const idx = (speaker % 6) + 1
  return `var(--s${idx})`
}

export function speakerLabel(speaker: number | null): string {
  return speaker === null ? '發言中' : `發言者 ${speaker + 1}`
}
