// Client for the Cloudflare Worker API. All endpoints live under /api.
// Calls degrade gracefully when the backend is not yet connected.
import type { MinutesDoc, SessionPayload } from './types'

async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${path} ${res.status} ${detail}`)
  }
  return (await res.json()) as T
}

/** Translate one finalized segment. source/target are DeepL language codes. */
export async function translateText(
  text: string,
  source: string,
  target: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await postJSON<{ translation: string }>('/api/translate', { text, source, target }, signal)
  return data.translation
}

/** Ask the backend to generate AI minutes for a room from its stored transcript. */
export async function requestMinutes(roomId: string, lang: string): Promise<MinutesDoc> {
  return postJSON<MinutesDoc>('/api/minutes', { roomId, lang })
}

/** Generate minutes directly from a transcript (local-history fallback path). */
export async function requestMinutesFromTranscript(
  transcript: string,
  title: string,
  lang: string,
): Promise<MinutesDoc> {
  return postJSON<MinutesDoc>('/api/minutes', { transcript, title, lang })
}

/** Fetch a short-lived Deepgram key so the browser/room can stream directly. */
export async function getDeepgramToken(): Promise<{ key: string; expiresAt: number }> {
  return postJSON<{ key: string; expiresAt: number }>('/api/token', {})
}

/** Load a stored session (transcript + minutes) from the backend — used when
 *  a viewer opens a meeting on a device that has no local copy. */
export async function fetchSession(id: string): Promise<SessionPayload | null> {
  try {
    const res = await fetch(`/api/session/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    return (await res.json()) as SessionPayload
  } catch {
    return null
  }
}

export interface UsageInfo {
  deepl: { configured: boolean; used?: number; limit?: number; error?: string }
  deepgram: { configured: boolean; balance?: number | null; units?: string; error?: string }
  gemini: { available: boolean; note?: string }
}

/** Fetch per-provider API usage/quota (DeepL characters, Deepgram balance). */
export async function fetchUsage(): Promise<UsageInfo | null> {
  try {
    const res = await fetch('/api/usage')
    if (!res.ok) return null
    return (await res.json()) as UsageInfo
  } catch {
    return null
  }
}

export async function backendAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}
