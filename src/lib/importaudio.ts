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

/** Collect a file handed over by the OS share sheet (see public/share-target-sw.js). */
export async function takeSharedFile(): Promise<File | null> {
  try {
    const cache = await caches.open('lm-share')
    const res = await cache.match('/__shared-audio')
    if (!res) return null
    await cache.delete('/__shared-audio') // one-shot
    const blob = await res.blob()
    if (!blob.size) return null
    const name = decodeURIComponent(res.headers.get('x-lm-filename') || 'shared-audio')
    return new File([blob], name, { type: blob.type || 'audio/mpeg' })
  } catch {
    return null
  }
}

// ---- Resumable jobs ----
// The upload is the slow part, and the Files API URI outlives our page, so a
// job that dies mid-transcription can resume from the URI without re-uploading.
const JOB_KEY = 'lm-import-job'
const JOB_TTL_MS = 20 * 60 * 60 * 1000 // Files API uploads expire well before this

export interface ImportJob {
  sessionId: string
  fileName: string
  title: string
  uri: string
  mime: string
  durationSec: number
  windows: { start: string; end: string }[]
  nextWindow: number
  roster: string[]
  utterances: Utterance[]
  opts: { lang: string; participants: string; glossary: string }
  generateMinutes: boolean
  createdAt: number
}

export function saveJob(job: ImportJob): void {
  try {
    localStorage.setItem(JOB_KEY, JSON.stringify(job))
  } catch {
    /* quota — the job just won't be resumable */
  }
}

export function loadJob(): ImportJob | null {
  try {
    const raw = localStorage.getItem(JOB_KEY)
    if (!raw) return null
    const job = JSON.parse(raw) as ImportJob
    if (!job?.uri || Date.now() - job.createdAt > JOB_TTL_MS) {
      clearJob()
      return null
    }
    return job
  } catch {
    return null
  }
}

export function clearJob(): void {
  try {
    localStorage.removeItem(JOB_KEY)
  } catch {
    /* ignore */
  }
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

/** Upload the file and create a resumable job (no transcription yet). */
export async function beginImportJob(
  file: File,
  probe: FileProbe,
  meta: { sessionId: string; title: string; generateMinutes: boolean },
  opts: { lang: string; participants: string; glossary: string },
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportJob> {
  onProgress?.({ phase: 'upload', done: 0, total: 1, label: '上傳音檔' })
  const { uri, mime } = await uploadAudioFile(file, probe.mime, file.name)
  const job: ImportJob = {
    sessionId: meta.sessionId,
    fileName: file.name,
    title: meta.title,
    uri,
    mime,
    durationSec: probe.durationSec,
    windows: planWindows(probe.durationSec),
    nextWindow: 0,
    roster: [],
    utterances: [],
    opts,
    generateMinutes: meta.generateMinutes,
    createdAt: Date.now(),
  }
  saveJob(job)
  return job
}

/** Run (or continue) the transcription passes of a job, saving after each so a
 *  closed tab or a failure can pick up where it stopped. */
export async function runImportJob(job: ImportJob, onProgress?: (p: ImportProgress) => void): Promise<ImportResult> {
  const single = job.windows.length === 0
  const total = single ? 1 : job.windows.length

  while (job.nextWindow < total) {
    const i = job.nextWindow
    const w = single ? undefined : job.windows[i]
    onProgress?.({
      phase: 'transcribe',
      done: i,
      total,
      label: single ? '辨識中（整檔）' : `辨識第 ${i + 1}/${total} 段（${w!.start}–${w!.end}）`,
      partial: job.utterances,
    })
    const r = await transcribeUri({
      uri: job.uri,
      mime: job.mime,
      ...job.opts,
      knownSpeakers: [...job.roster],
      window: w,
    })
    job.utterances = job.utterances.concat(toUtterances(r.utterances, job.roster))
    job.nextWindow = i + 1
    saveJob(job) // checkpoint
  }

  onProgress?.({ phase: 'merge', done: total, total, label: '整理中', partial: job.utterances })
  const utterances = dedupe(job.utterances)
  const speakerNames: Record<number, string> = {}
  job.roster.forEach((n, i) => {
    if (!/^發言者\s*\d*$/.test(n)) speakerNames[i] = n
  })
  return { utterances, speakerNames, durationSec: job.durationSec }
}
