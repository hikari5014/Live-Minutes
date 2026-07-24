// Shared domain types (frontend). Kept in sync with worker/types.ts.

export type LangCode = 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es'

// Target can be a language, or 'none' = 不翻譯（純逐字稿）
export type TargetLang = LangCode | 'none'

export interface LangOption {
  code: LangCode
  label: string // 顯示名稱（繁中）
  native: string // 該語言原生名稱
  deepl: string // DeepL 目標語言碼
  deeplSource: string // DeepL 來源語言碼
  deepgram: string // Deepgram 辨識語言碼
  bcp47: string // Web Speech / SpeechRecognition
}

export interface MeetingSettings {
  title: string
  sourceLang: LangCode
  targetLang: TargetLang
  diarization: boolean
  generateMinutes: boolean
  asrProvider: 'auto' | 'deepgram' | 'webspeech'
}

export interface Utterance {
  id: string
  speaker: number | null // 語者索引（0-based），無語者分離時為 null
  source: string // 原文
  translation: string | null // 譯文（不翻譯時為 null）
  ts: number // 相對會議開始的毫秒
  final: boolean
}

export interface Interim {
  speaker: number | null
  source: string
  translation: string | null
}

export type SessionStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error'

export interface MinutesDoc {
  title: string
  summary: string
  decisions: string[]
  actionItems: { text: string; owner?: string }[]
  topics: { title: string; points: string[] }[]
  lang: string
  createdAt: number
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  durationSec: number
  sourceLang: LangCode
  targetLang: TargetLang
  speakers: number
  hasMinutes: boolean
}

export interface SessionPayload {
  meta: SessionMeta
  utterances: Utterance[]
  minutes: MinutesDoc | null
}
