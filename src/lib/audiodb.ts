// Local audio storage (IndexedDB). Recordings are kept as *segments*: the
// recorder restarts every few minutes so each segment is a standalone, valid
// media file (a MediaRecorder timeslice chunk on its own is not — only the
// first chunk carries the container header). Segments give us three things:
// crash-safe incremental writes, bounded upload sizes, and timestamp seeking.
export interface SegmentMeta {
  sessionId: string
  seg: number
  mime: string
  startMs: number // offset from meeting start
  durationMs: number
  bytes: number
}

export interface RecordingMeta {
  sessionId: string
  title: string
  createdAt: number
  mime: string
  segments: number
  bytes: number
  durationMs: number
}

const DB_NAME = 'lm-audio'
const DB_VERSION = 1
const PARTS = 'parts' // raw timeslice chunks
const SEGS = 'segs' // completed segments
const RECS = 'recs' // one row per recording

export function audioSupported(): boolean {
  return typeof indexedDB !== 'undefined' && typeof MediaRecorder !== 'undefined'
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PARTS)) {
        const s = db.createObjectStore(PARTS, { keyPath: 'key' })
        s.createIndex('bySeg', 'segKey')
        s.createIndex('bySession', 'sessionId')
      }
      if (!db.objectStoreNames.contains(SEGS)) {
        const s = db.createObjectStore(SEGS, { keyPath: 'key' })
        s.createIndex('bySession', 'sessionId')
      }
      if (!db.objectStoreNames.contains(RECS)) db.createObjectStore(RECS, { keyPath: 'sessionId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(store: string | string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        let out: T
        Promise.resolve(run(t))
          .then((v) => {
            out = v
          })
          .catch(reject)
        t.oncomplete = () => {
          db.close()
          resolve(out)
        }
        t.onerror = () => {
          db.close()
          reject(t.error)
        }
        t.onabort = () => {
          db.close()
          reject(t.error)
        }
      }),
  )
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const segKey = (sessionId: string, seg: number) => `${sessionId}|${String(seg).padStart(4, '0')}`
const partKey = (sessionId: string, seg: number, chunk: number) => `${segKey(sessionId, seg)}|${String(chunk).padStart(6, '0')}`

/** Append one timeslice chunk. Called continuously while recording. */
export async function putChunk(sessionId: string, seg: number, chunk: number, blob: Blob): Promise<void> {
  await tx(PARTS, 'readwrite', (t) => {
    t.objectStore(PARTS).put({ key: partKey(sessionId, seg, chunk), segKey: segKey(sessionId, seg), sessionId, seg, chunk, blob })
  })
}

/** Close a segment: record its metadata so it can be assembled and seeked. */
export async function finishSegment(meta: SegmentMeta): Promise<void> {
  await tx(SEGS, 'readwrite', (t) => {
    t.objectStore(SEGS).put({ key: segKey(meta.sessionId, meta.seg), ...meta })
  })
}

export async function upsertRecording(meta: RecordingMeta): Promise<void> {
  await tx(RECS, 'readwrite', (t) => {
    t.objectStore(RECS).put(meta)
  })
}

export async function listSegments(sessionId: string): Promise<SegmentMeta[]> {
  const rows = await tx(SEGS, 'readonly', (t) => wrap(t.objectStore(SEGS).index('bySession').getAll(sessionId)))
  return (rows as SegmentMeta[]).sort((a, b) => a.seg - b.seg)
}

/** Assemble one segment's chunks into a single playable/uploadable Blob. */
export async function getSegmentBlob(sessionId: string, seg: number, mime: string): Promise<Blob | null> {
  const rows = (await tx(PARTS, 'readonly', (t) =>
    wrap(t.objectStore(PARTS).index('bySeg').getAll(segKey(sessionId, seg))),
  )) as { chunk: number; blob: Blob }[]
  if (!rows.length) return null
  rows.sort((a, b) => a.chunk - b.chunk)
  return new Blob(rows.map((r) => r.blob), { type: mime })
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const rows = await tx(RECS, 'readonly', (t) => wrap(t.objectStore(RECS).getAll()))
  return (rows as RecordingMeta[]).sort((a, b) => b.createdAt - a.createdAt)
}

export async function getRecording(sessionId: string): Promise<RecordingMeta | null> {
  const r = await tx(RECS, 'readonly', (t) => wrap(t.objectStore(RECS).get(sessionId)))
  return (r as RecordingMeta) ?? null
}

export async function deleteRecording(sessionId: string): Promise<void> {
  const parts = (await tx(PARTS, 'readonly', (t) => wrap(t.objectStore(PARTS).index('bySession').getAllKeys(sessionId)))) as IDBValidKey[]
  const segs = (await tx(SEGS, 'readonly', (t) => wrap(t.objectStore(SEGS).index('bySession').getAllKeys(sessionId)))) as IDBValidKey[]
  await tx([PARTS, SEGS, RECS], 'readwrite', (t) => {
    parts.forEach((k) => t.objectStore(PARTS).delete(k))
    segs.forEach((k) => t.objectStore(SEGS).delete(k))
    t.objectStore(RECS).delete(sessionId)
  })
}

export async function totalBytes(): Promise<number> {
  const recs = await listRecordings()
  return recs.reduce((n, r) => n + r.bytes, 0)
}

/** Delete audio older than `days` (transcripts are kept — they live elsewhere). */
export async function pruneOlderThan(days: number): Promise<number> {
  if (!days || days <= 0) return 0
  const cutoff = Date.now() - days * 86400_000
  const old = (await listRecordings()).filter((r) => r.createdAt < cutoff)
  for (const r of old) await deleteRecording(r.sessionId)
  return old.length
}

/** Map a meeting-relative timestamp to the segment containing it. */
export function locate(segments: SegmentMeta[], ms: number): { seg: SegmentMeta; offsetSec: number } | null {
  for (const s of segments) {
    if (ms >= s.startMs && ms < s.startMs + s.durationMs) return { seg: s, offsetSec: (ms - s.startMs) / 1000 }
  }
  const last = segments[segments.length - 1]
  if (last && ms >= last.startMs) return { seg: last, offsetSec: Math.max(0, (ms - last.startMs) / 1000) }
  return segments[0] ? { seg: segments[0], offsetSec: 0 } : null
}
