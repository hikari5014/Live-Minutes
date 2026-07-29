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

/** Translate with auto source-language detection; also returns DeepL's detected source language. */
export async function translateDetect(text: string, target: string): Promise<{ translation: string; detectedSource: string }> {
  const data = await postJSON<{ translation: string; detectedSource?: string }>('/api/translate', { text, target }, undefined)
  return { translation: data.translation, detectedSource: data.detectedSource ?? '' }
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

export interface GeminiUtterance {
  speaker: string
  text: string
  start: string // MM:SS within the segment
}

/** Send one audio segment to the backend for Gemini transcription.
 *  mode 'text' returns a free-form reply (diagnostics); 'transcript' returns
 *  structured utterances plus the speaker roster found in that segment. */
export async function transcribeAudio(
  blob: Blob,
  mime: string,
  opts: {
    mode?: 'text' | 'transcript'
    prompt?: string
    lang?: string
    participants?: string
    knownSpeakers?: string[]
    glossary?: string
    name?: string
  } = {},
): Promise<{ text?: string; utterances?: GeminiUtterance[]; speakers?: string[] }> {
  const fd = new FormData()
  fd.append('audio', blob, opts.name ?? 'audio')
  fd.append('mime', mime)
  fd.append('mode', opts.mode ?? 'text')
  if (opts.prompt) fd.append('prompt', opts.prompt)
  if (opts.lang) fd.append('lang', opts.lang)
  if (opts.participants) fd.append('participants', opts.participants)
  if (opts.knownSpeakers?.length) fd.append('knownSpeakers', opts.knownSpeakers.join(','))
  if (opts.glossary) fd.append('glossary', opts.glossary)
  const res = await fetch('/api/audio', { method: 'POST', body: fd })
  const data = (await res.json().catch(() => ({}))) as { error?: string; text?: string; utterances?: GeminiUtterance[]; speakers?: string[] }
  if (!res.ok) throw new Error(data.error || `audio ${res.status}`)
  return data
}

export interface BackupItem {
  id: string
  payload: string
  updatedAt: number
}

/** Push local meetings to the cloud backup keyed by a device capability key. */
export async function pushBackup(key: string, items: BackupItem[]): Promise<boolean> {
  try {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, items }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Pull all backed-up meetings for a key. */
export async function pullBackup(key: string): Promise<BackupItem[] | null> {
  try {
    const res = await fetch(`/api/backup?key=${encodeURIComponent(key)}`)
    if (!res.ok) return null
    const d = (await res.json()) as { items?: BackupItem[] }
    return d.items ?? []
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
