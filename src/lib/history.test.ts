import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveSession,
  listSessions,
  listArchived,
  updateSessionMeta,
  deleteSession,
  createFolder,
  listFolders,
  sessionsInFolder,
  deleteFolder,
  searchSessions,
  exportAll,
  importBackup,
} from './history'
import type { SessionMeta, Utterance } from './types'

const meta = (id: string, over: Partial<SessionMeta> = {}): SessionMeta => ({
  id,
  title: `會議 ${id}`,
  createdAt: 1,
  durationSec: 10,
  sourceLang: 'en',
  targetLang: 'zh',
  speakers: 1,
  hasMinutes: false,
  ...over,
})
const utt = (source: string): Utterance => ({ id: 'u-' + source, speaker: 0, source, translation: null, ts: 0, final: true })

beforeEach(() => localStorage.clear())

describe('sessions', () => {
  it('saves and lists', () => {
    saveSession(meta('1'), [utt('hello')])
    expect(listSessions().map((s) => s.id)).toEqual(['1'])
  })
  it('archives out of the main list', () => {
    saveSession(meta('1'), [])
    updateSessionMeta('1', { archived: true })
    expect(listSessions()).toHaveLength(0)
    expect(listArchived().map((s) => s.id)).toEqual(['1'])
  })
  it('sorts pinned first then by createdAt desc', () => {
    saveSession(meta('a1', { createdAt: 1 }), [])
    saveSession(meta('a2', { createdAt: 2 }), [])
    saveSession(meta('a3', { createdAt: 3, pinned: true }), [])
    expect(listSessions().map((s) => s.id)).toEqual(['a3', 'a2', 'a1'])
  })
  it('deletes', () => {
    saveSession(meta('1'), [])
    deleteSession('1')
    expect(listSessions()).toHaveLength(0)
  })
})

describe('folders', () => {
  it('creates, assigns, and deletes while keeping meetings', () => {
    const f = createFolder('工作')
    expect(listFolders().map((x) => x.name)).toEqual(['工作'])
    saveSession(meta('1', { folderId: f.id }), [])
    expect(sessionsInFolder(f.id).map((s) => s.id)).toEqual(['1'])
    deleteFolder(f.id)
    expect(listFolders()).toHaveLength(0)
    expect(listSessions().map((s) => s.id)).toEqual(['1'])
    expect(listSessions()[0].folderId ?? null).toBeNull()
  })
})

describe('search', () => {
  it('matches title and transcript content', () => {
    saveSession(meta('1', { title: '週會' }), [utt('deploy on friday')])
    saveSession(meta('2', { title: '其他' }), [utt('random')])
    expect(searchSessions('週').map((s) => s.id)).toEqual(['1'])
    expect(searchSessions('friday').map((s) => s.id)).toEqual(['1'])
    expect(searchSessions('random').map((s) => s.id)).toEqual(['2'])
  })
})

describe('backup roundtrip', () => {
  it('exports and re-imports meetings', () => {
    saveSession(meta('1'), [utt('hi')])
    saveSession(meta('2'), [utt('yo')])
    const blobs = exportAll()
    localStorage.clear()
    expect(listSessions()).toHaveLength(0)
    expect(importBackup(blobs)).toBe(2)
    expect(
      listSessions()
        .map((s) => s.id)
        .sort(),
    ).toEqual(['1', '2'])
  })
})
