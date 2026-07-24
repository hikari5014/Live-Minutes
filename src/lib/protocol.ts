// WebSocket wire protocol shared between the frontend room client and the
// worker's MeetingRoom Durable Object. Kept in sync with worker/protocol.ts.
import type { TargetLang } from './types'

// ---- Server -> Client ----
export interface WireCaption {
  t: 'caption'
  id: string
  speaker: number | null
  source: string
  translation: string | null
  ts: number
}
export interface WireInterim {
  t: 'interim'
  speaker: number | null
  source: string
  translation: string | null
}
export interface WireSync {
  t: 'sync'
  title: string
  sourceLang: string
  targetLang: string
  status: string
  viewers: number
  utterances: WireCaption[]
}
export interface WireMeta {
  t: 'meta'
  title: string
  status: string
  viewers: number
}
export interface WireEnded {
  t: 'ended'
}
export type ServerMsg = WireCaption | WireInterim | WireSync | WireMeta | WireEnded

// ---- Client -> Server ----
export interface HelloMsg {
  t: 'hello'
  role: 'host' | 'viewer'
  lang?: TargetLang
  source?: string
  target?: TargetLang
  title?: string
}
export interface PubFinal {
  t: 'final'
  id: string
  speaker: number | null
  source: string
  ts: number
}
export interface PubInterim {
  t: 'interim'
  speaker: number | null
  source: string
}
export interface PubEnd {
  t: 'end'
}
export interface SetLang {
  t: 'lang'
  lang: TargetLang
}
export type ClientMsg = HelloMsg | PubFinal | PubInterim | PubEnd | SetLang
