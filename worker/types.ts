export interface Env {
  ASSETS: Fetcher
  ROOMS: DurableObjectNamespace
  DB: D1Database
  DEEPL_API_KEY?: string
  DEEPL_API_HOST?: string
  DEEPGRAM_API_KEY?: string
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
}

export interface MinutesDoc {
  title: string
  summary: string
  decisions: string[]
  actionItems: { text: string; owner?: string }[]
  topics: { title: string; points: string[] }[]
  lang: string
  createdAt: number
}

export interface SessionRow {
  id: string
  title: string
  created_at: number
  duration_sec: number
  source_lang: string
  target_lang: string
  speakers: number
  has_minutes: number
}

export interface UtteranceRow {
  id: string
  session_id: string
  speaker: number | null
  source: string
  translation: string | null
  ts: number
}
