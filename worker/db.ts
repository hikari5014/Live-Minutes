import type { Env, MinutesDoc, SessionRow, UtteranceRow } from './types'
import type { WireCaption } from './protocol'

export interface SessionMetaRow {
  id: string
  title: string
  createdAt: number
  durationSec: number
  sourceLang: string
  targetLang: string
  speakers: number
}

export async function saveSessionToD1(env: Env, meta: SessionMetaRow, utterances: WireCaption[]): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO sessions (id,title,created_at,duration_sec,source_lang,target_lang,speakers,has_minutes)
     VALUES (?,?,?,?,?,?,?, COALESCE((SELECT has_minutes FROM sessions WHERE id=?),0))`,
  )
    .bind(meta.id, meta.title, meta.createdAt, meta.durationSec, meta.sourceLang, meta.targetLang, meta.speakers, meta.id)
    .run()

  if (utterances.length) {
    const stmt = env.DB.prepare(
      `INSERT OR REPLACE INTO utterances (id,session_id,speaker,source,translation,ts) VALUES (?,?,?,?,?,?)`,
    )
    const batch = utterances.map((u) => stmt.bind(u.id, meta.id, u.speaker, u.source, u.translation, u.ts))
    await env.DB.batch(batch)
  }
}

export async function saveMinutesToD1(env: Env, sessionId: string, doc: MinutesDoc): Promise<void> {
  await env.DB.prepare(`INSERT OR REPLACE INTO minutes (session_id,doc,created_at) VALUES (?,?,?)`)
    .bind(sessionId, JSON.stringify(doc), doc.createdAt)
    .run()
  await env.DB.prepare(`UPDATE sessions SET has_minutes=1 WHERE id=?`).bind(sessionId).run()
}

export interface SessionPayload {
  meta: {
    id: string
    title: string
    createdAt: number
    durationSec: number
    sourceLang: string
    targetLang: string
    speakers: number
    hasMinutes: boolean
  }
  utterances: { id: string; speaker: number | null; source: string; translation: string | null; ts: number; final: true }[]
  minutes: MinutesDoc | null
}

export async function getSessionFromD1(env: Env, id: string): Promise<SessionPayload | null> {
  const s = await env.DB.prepare(`SELECT * FROM sessions WHERE id=?`).bind(id).first<SessionRow>()
  if (!s) return null
  const us = await env.DB.prepare(`SELECT * FROM utterances WHERE session_id=? ORDER BY ts ASC`).bind(id).all<UtteranceRow>()
  const m = await env.DB.prepare(`SELECT doc FROM minutes WHERE session_id=?`).bind(id).first<{ doc: string }>()
  return {
    meta: {
      id: s.id,
      title: s.title,
      createdAt: s.created_at,
      durationSec: s.duration_sec,
      sourceLang: s.source_lang,
      targetLang: s.target_lang,
      speakers: s.speakers,
      hasMinutes: !!s.has_minutes,
    },
    utterances: (us.results ?? []).map((u) => ({
      id: u.id,
      speaker: u.speaker,
      source: u.source,
      translation: u.translation,
      ts: u.ts,
      final: true as const,
    })),
    minutes: m ? (JSON.parse(m.doc) as MinutesDoc) : null,
  }
}

export async function getTranscriptFromD1(env: Env, id: string): Promise<string | null> {
  const us = await env.DB.prepare(`SELECT * FROM utterances WHERE session_id=? ORDER BY ts ASC`).bind(id).all<UtteranceRow>()
  if (!us.results || us.results.length === 0) return null
  return us.results.map((u) => u.source).join('\n')
}
