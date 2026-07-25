// Local session history (localStorage). Lets the app work fully offline for
// the single-device / Web Speech path; the backend mirrors this in D1.
import type { Folder, MinutesDoc, SessionMeta, Utterance } from './types'

const INDEX_KEY = 'lm-sessions'
const FOLDERS_KEY = 'lm-folders'
const DRAFT_KEY = 'lm-draft'
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
  return read<SessionMeta[]>(INDEX_KEY, [])
    .filter((s) => !s.archived)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt)
}

export function listArchived(): SessionMeta[] {
  return read<SessionMeta[]>(INDEX_KEY, [])
    .filter((s) => s.archived)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function updateSessionMeta(id: string, patch: Partial<SessionMeta>): void {
  const idx = read<SessionMeta[]>(INDEX_KEY, [])
  const i = idx.findIndex((s) => s.id === id)
  if (i >= 0) {
    idx[i] = { ...idx[i], ...patch }
    write(INDEX_KEY, idx)
  }
}

export function sessionsInFolder(folderId: string): SessionMeta[] {
  return read<SessionMeta[]>(INDEX_KEY, [])
    .filter((s) => s.folderId === folderId && !s.archived)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function saveSession(meta: SessionMeta, utterances: Utterance[]): void {
  const idx = read<SessionMeta[]>(INDEX_KEY, []).filter((s) => s.id !== meta.id)
  idx.unshift(meta)
  write(INDEX_KEY, idx.slice(0, 50))
  write(sessionKey(meta.id), utterances)
}

export function updateUtterances(id: string, utterances: Utterance[]): void {
  write(sessionKey(id), utterances)
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

// ---- Folders (分類資料夾) ----

export function listFolders(): Folder[] {
  return read<Folder[]>(FOLDERS_KEY, []).sort((a, b) => a.createdAt - b.createdAt)
}

export function createFolder(name: string): Folder {
  const f: Folder = { id: crypto.randomUUID(), name: name.trim() || '未命名資料夾', createdAt: Date.now() }
  const list = read<Folder[]>(FOLDERS_KEY, [])
  list.push(f)
  write(FOLDERS_KEY, list)
  return f
}

export function renameFolder(id: string, name: string): void {
  const list = read<Folder[]>(FOLDERS_KEY, []).map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f))
  write(FOLDERS_KEY, list)
}

export function deleteFolder(id: string): void {
  // Unassign sessions in this folder (meetings are kept), then drop the folder.
  const idx = read<SessionMeta[]>(INDEX_KEY, []).map((s) => (s.folderId === id ? { ...s, folderId: null } : s))
  write(INDEX_KEY, idx)
  write(
    FOLDERS_KEY,
    read<Folder[]>(FOLDERS_KEY, []).filter((f) => f.id !== id),
  )
}

// ---- In-progress draft (crash / close recovery) ----

export function saveDraft(meta: SessionMeta, utterances: Utterance[]): void {
  write(DRAFT_KEY, { meta, utterances })
}

export function getDraft(): { meta: SessionMeta; utterances: Utterance[] } | null {
  return read<{ meta: SessionMeta; utterances: Utterance[] } | null>(DRAFT_KEY, null)
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}
