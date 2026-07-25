// Lightweight UI localization for the viewer-facing room page, so foreign
// participants don't see a Chinese-only interface. Covers the small set of
// languages the app translates into.
import type { TargetLang } from './types'

type Key = 'subtitleLang' | 'original' | 'watching' | 'ended' | 'connError' | 'viewMinutes' | 'empty'

const DICT: Record<string, Record<Key, string>> = {
  zh: {
    subtitleLang: '字幕語言',
    original: '原文（不翻譯）',
    watching: '即時觀看',
    ended: '會議已結束',
    connError: '連線中斷，重試中…',
    viewMinutes: '查看會議紀錄',
    empty: '等待字幕…',
  },
  en: {
    subtitleLang: 'Subtitle language',
    original: 'Original (no translation)',
    watching: 'Live',
    ended: 'Meeting ended',
    connError: 'Connection lost, retrying…',
    viewMinutes: 'View minutes',
    empty: 'Waiting for captions…',
  },
  ja: {
    subtitleLang: '字幕の言語',
    original: '原文（翻訳なし）',
    watching: 'ライブ視聴',
    ended: '会議は終了しました',
    connError: '接続が切れました。再試行中…',
    viewMinutes: '議事録を見る',
    empty: '字幕を待っています…',
  },
  ko: {
    subtitleLang: '자막 언어',
    original: '원문(번역 없음)',
    watching: '실시간 보기',
    ended: '회의가 종료되었습니다',
    connError: '연결이 끊겼습니다. 재시도 중…',
    viewMinutes: '회의록 보기',
    empty: '자막을 기다리는 중…',
  },
  de: {
    subtitleLang: 'Untertitelsprache',
    original: 'Original (keine Übersetzung)',
    watching: 'Live',
    ended: 'Meeting beendet',
    connError: 'Verbindung getrennt, erneuter Versuch…',
    viewMinutes: 'Protokoll ansehen',
    empty: 'Warte auf Untertitel…',
  },
  fr: {
    subtitleLang: 'Langue des sous-titres',
    original: 'Original (sans traduction)',
    watching: 'En direct',
    ended: 'Réunion terminée',
    connError: 'Connexion perdue, nouvelle tentative…',
    viewMinutes: 'Voir le compte rendu',
    empty: 'En attente des sous-titres…',
  },
  es: {
    subtitleLang: 'Idioma de subtítulos',
    original: 'Original (sin traducción)',
    watching: 'En vivo',
    ended: 'Reunión finalizada',
    connError: 'Conexión perdida, reintentando…',
    viewMinutes: 'Ver acta',
    empty: 'Esperando subtítulos…',
  },
}

export function detectLang(): string {
  const n = (typeof navigator !== 'undefined' ? navigator.language : 'zh').toLowerCase()
  if (n.startsWith('zh')) return 'zh'
  const two = n.slice(0, 2)
  return DICT[two] ? two : 'zh'
}

/** Best initial subtitle language for a viewer, from their browser locale. */
export function detectTargetLang(): TargetLang {
  return detectLang() as TargetLang
}

/** Which UI language to render: the chosen subtitle language, else browser locale. */
export function uiLang(lang: TargetLang): string {
  if (lang !== 'none' && DICT[lang]) return lang
  return detectLang()
}

export function t(lang: string, key: Key): string {
  return (DICT[lang] ?? DICT.zh)[key]
}
