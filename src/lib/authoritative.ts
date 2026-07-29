// Build the "authoritative" transcript from the recorded audio: each segment is
// sent to Gemini in order, carrying the speaker roster forward so a person keeps
// the same label across segments (the failure mode of per-chunk transcription).
import { listSegments, getSegmentBlob, getRecording } from './audiodb'
import { transcribeAudio, type GeminiUtterance } from './api'
import type { Utterance } from './types'

export interface BuildProgress {
  done: number
  total: number
  label: string
}

export interface BuildResult {
  utterances: Utterance[]
  speakerNames: Record<number, string>
  speakers: string[]
}

/** "MM:SS" / "M:SS" / "HH:MM:SS" -> milliseconds. Unparseable -> 0. */
export function parseClock(s: string): number {
  const parts = String(s ?? '')
    .trim()
    .split(':')
    .map((x) => Number(x.replace(/[^\d.]/g, '')))
  if (parts.some((n) => Number.isNaN(n))) return 0
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000
  if (parts.length === 1) return parts[0] * 1000
  return 0
}

/** Assign a stable index per speaker name, in first-appearance order. */
export function rosterIndex(roster: string[], name: string): number {
  const clean = (name || '').trim() || '發言者'
  const i = roster.indexOf(clean)
  if (i >= 0) return i
  roster.push(clean)
  return roster.length - 1
}

export function toUtterances(
  segUtts: GeminiUtterance[],
  segStartMs: number,
  roster: string[],
): Utterance[] {
  return segUtts
    .filter((u) => (u.text ?? '').trim())
    .map((u) => ({
      id: crypto.randomUUID(),
      speaker: rosterIndex(roster, u.speaker),
      source: u.text.trim(),
      translation: null,
      ts: segStartMs + parseClock(u.start),
      final: true,
    }))
}

export async function hasRecording(sessionId: string): Promise<boolean> {
  const r = await getRecording(sessionId).catch(() => null)
  return !!r && r.bytes > 0
}

/** Transcribe every segment of a recording and merge into one transcript. */
export async function buildAuthoritativeTranscript(
  sessionId: string,
  opts: { lang: string; participants: string; glossary: string },
  onProgress?: (p: BuildProgress) => void,
): Promise<BuildResult> {
  const segments = await listSegments(sessionId)
  if (!segments.length) throw new Error('找不到這場會議的錄音檔')

  const roster: string[] = []
  const out: Utterance[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    onProgress?.({ done: i, total: segments.length, label: `辨識第 ${i + 1}/${segments.length} 段` })
    const blob = await getSegmentBlob(sessionId, seg.seg, seg.mime)
    if (!blob || blob.size === 0) continue
    const res = await transcribeAudio(blob, seg.mime, {
      mode: 'transcript',
      lang: opts.lang,
      participants: opts.participants,
      glossary: opts.glossary,
      knownSpeakers: [...roster],
      name: `${sessionId}-${seg.seg}`,
    })
    out.push(...toUtterances(res.utterances ?? [], seg.startMs, roster))
  }

  onProgress?.({ done: segments.length, total: segments.length, label: '整理中' })
  out.sort((a, b) => a.ts - b.ts)
  const speakerNames: Record<number, string> = {}
  roster.forEach((n, i) => {
    // Generic placeholders stay as the app's own numbering; real names are kept.
    if (!/^發言者\s*\d*$/.test(n)) speakerNames[i] = n
  })
  return { utterances: out, speakerNames, speakers: roster }
}
