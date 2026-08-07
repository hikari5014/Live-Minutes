// Import an existing recording (Zoom/Teams export, voice memo, forwarded file)
// and turn it into a normal meeting: transcript with speakers, then minutes.
//
// An imported file is ONE container, so unlike our own recordings it cannot be
// byte-sliced. We upload it to the Files API once and then transcribe it —
// either in a single pass (short files) or window by window (long files) using
// the same URI. Window boundaries are honoured only approximately, so windows
// overlap and the results are de-duplicated.
import { uploadAudioFile, transcribeUri, type GeminiUtterance } from './api'
import { parseClock, rosterIndex } from './authoritative'
import type { Utterance } from './types'

export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024 // Worker hard-caps at 100MB
export const AUDIO_TOKENS_PER_SEC = 32 // measured
const SINGLE_PASS_MAX_SEC = 20 * 60 // beyond this, transcribe window by window
const WINDOW_SEC = 10 * 60
const OVERLAP_SEC = 15 // absorbs imprecise window boundaries

export const ACCEPTED_EXT = ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'opus', 'webm', 'mp4', 'flac', 'mov', 'm4v']

export interface FileProbe {
  name: string
  size: number
  mime: string
  durationSec: number
  isVideo: boolean
  tokenEstimate: number
  tooBig: boolean
  unsupported: boolean
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Read duration without decoding the whole file (metadata only). */
export function probeDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('video') // handles audio and video containers
    const url = URL.createObjectURL(file)
    const done = (d: number) => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(d) && d > 0 ? d : 0)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(el.duration)
    el.onerror = () => done(0)
    setTimeout(() => done(el.duration || 0), 8000) // never hang the UI
    el.src = url
  })
}

export async function probeFile(file: File): Promise<FileProbe> {
  const ext = extOf(file.name)
  const mime = file.type || guessMime(ext)
  const durationSec = await probeDuration(file)
  return {
    name: file.name,
    size: file.size,
    mime,
    durationSec,
    isVideo: mime.startsWith('video/') || ['mp4', 'mov', 'm4v'].includes(ext),
    tokenEstimate: Math.round(durationSec * AUDIO_TOKENS_PER_SEC),
    tooBig: file.size > MAX_UPLOAD_BYTES,
    unsupported: !ACCEPTED_EXT.includes(ext) && !mime.startsWith('audio/') && !mime.startsWith('video/'),
  }
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac',
    ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4',
  }
  return map[ext] ?? 'audio/mpeg'
}

/** Plan the transcription passes for a given duration. */
export function planWindows(durationSec: number): { start: string; end: string }[] {
  if (!durationSec || durationSec <= SINGLE_PASS_MAX_SEC) return []
  const out: { start: string; end: string }[] = []
  for (let s = 0; s < durationSec; s += WINDOW_SEC) {
    const start = Math.max(0, s - (s > 0 ? OVERLAP_SEC : 0))
    const end = Math.min(durationSec, s + WINDOW_SEC)
    out.push({ start: clock(start), end: clock(end) })
    if (end >= durationSec) break
  }
  return out
}

/** Drop utterances that repeat across an overlap boundary. */
export function dedupe(list: Utterance[]): Utterance[] {
  const seen = new Set<string>()
  const out: Utterance[] = []
  for (const u of [...list].sort((a, b) => a.ts - b.ts)) {
    const key = `${u.speaker}|${u.source.replace(/\s+/g, '').slice(0, 40)}`
    const near = out.some((x) => Math.abs(x.ts - u.ts) < 30_000 && `${x.speaker}|${x.source.replace(/\s+/g, '').slice(0, 40)}` === key)
    if (near || seen.has(`${key}|${Math.round(u.ts / 1000)}`)) continue
    seen.add(`${key}|${Math.round(u.ts / 1000)}`)
    out.push(u)
  }
  return out
}

function toUtterances(list: GeminiUtterance[], roster: string[]): Utterance[] {
  return list
    .filter((u) => (u.text ?? '').trim())
    .map((u) => ({
      id: crypto.randomUUID(),
      speaker: rosterIndex(roster, u.speaker),
      source: u.text.trim(),
      translation: null,
      ts: parseClock(u.start), // window prompts ask for absolute time
      final: true,
    }))
}

export interface ImportProgress {
  phase: 'upload' | 'transcribe' | 'merge'
  done: number
  total: number
  label: string
  partial?: Utterance[]
}

export interface ImportResult {
  utterances: Utterance[]
  speakerNames: Record<number, string>
  durationSec: number
}

export async function importAudioFile(
  file: File,
  probe: FileProbe,
  opts: { lang: string; participants: string; glossary: string },
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  onProgress?.({ phase: 'upload', done: 0, total: 1, label: '上傳音檔' })
  const { uri, mime } = await uploadAudioFile(file, probe.mime, file.name)

  const windows = planWindows(probe.durationSec)
  const roster: string[] = []
  let all: Utterance[] = []

  if (windows.length === 0) {
    onProgress?.({ phase: 'transcribe', done: 0, total: 1, label: '辨識中（整檔）' })
    const r = await transcribeUri({ uri, mime, ...opts, knownSpeakers: [] })
    all = toUtterances(r.utterances, roster)
  } else {
    for (let i = 0; i < windows.length; i++) {
      onProgress?.({
        phase: 'transcribe',
        done: i,
        total: windows.length,
        label: `辨識第 ${i + 1}/${windows.length} 段（${windows[i].start}–${windows[i].end}）`,
        partial: all,
      })
      const r = await transcribeUri({ uri, mime, ...opts, knownSpeakers: [...roster], window: windows[i] })
      all = all.concat(toUtterances(r.utterances, roster))
    }
  }

  onProgress?.({ phase: 'merge', done: 1, total: 1, label: '整理中' })
  const utterances = dedupe(all)
  const speakerNames: Record<number, string> = {}
  roster.forEach((n, i) => {
    if (!/^發言者\s*\d*$/.test(n)) speakerNames[i] = n
  })
  return { utterances, speakerNames, durationSec: probe.durationSec }
}
