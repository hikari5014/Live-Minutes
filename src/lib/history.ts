// Local session history (localStorage). Lets the app work fully offline for
// the single-device / Web Speech path; the backend mirrors this in D1.
import type { MinutesDoc, SessionMeta, Utterance } from './types'

const INDEX_KEY = 'lm-sessions'
const sessionKey = (id: string) => `lm-session:${id}`
const minutesKey = (id: string) => `lm-minutes:${id}`

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function listSessions(): SessionMeta[] {
  return read<SessionMeta[]>(INDEX_KEY, []).sort((a, b) => b.createdAt - a.createdAt)
}

export function saveSession(meta: SessionMeta, utterances: Utterance[]): void {
  const idx = read<SessionMeta[]>(INDEX_KEY, []).filter((s) => s.id !== meta.id)
  idx.unshift(meta)
  write(INDEX_KEY, idx.slice(0, 50))
  write(sessionKey(meta.id), utterances)
}

export function getSession(id: string): { meta: SessionMeta; utterances: Utterance[] } | null {
  const meta = read<SessionMeta[]>(INDEX_KEY, []).find((s) => s.id === id)
  if (!meta) return null
  return { meta, utterances: read<Utterance[]>(sessionKey(id), []) }
}

export function deleteSession(id: string): void {
  const idx = read<SessionMeta[]>(INDEX_KEY, []).filter((s) => s.id !== id)
  write(INDEX_KEY, idx)
  try {
    localStorage.removeItem(sessionKey(id))
    localStorage.removeItem(minutesKey(id))
  } catch {
    /* ignore */
  }
}

export function saveMinutes(id: string, doc: MinutesDoc): void {
  write(minutesKey(id), doc)
  const idx = read<SessionMeta[]>(INDEX_KEY, [])
  const meta = idx.find((s) => s.id === id)
  if (meta) {
    meta.hasMinutes = true
    write(INDEX_KEY, idx)
  }
}

export function getMinutes(id: string): MinutesDoc | null {
  return read<MinutesDoc | null>(minutesKey(id), null)
}
