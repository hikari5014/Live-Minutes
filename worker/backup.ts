import type { Env } from './types'

// Cloud backup, option B: a device holds a long random "backup key" (a bearer
// capability, no accounts). Meetings are stored as opaque JSON payloads in D1
// under that key, so clearing the browser / switching device can restore them.
export interface BackupItem {
  id: string
  payload: string
  updatedAt: number
}

const MIN_KEY_LEN = 16
const MAX_KEY_LEN = 200

export function validKey(key: unknown): key is string {
  return typeof key === 'string' && key.length >= MIN_KEY_LEN && key.length <= MAX_KEY_LEN && /^[A-Za-z0-9_-]+$/.test(key)
}

export async function putBackups(env: Env, key: string, items: BackupItem[]): Promise<number> {
  const clean = items.filter((it) => it && typeof it.id === 'string' && typeof it.payload === 'string').slice(0, 200)
  if (!clean.length) return 0
  const stmts = clean.map((it) =>
    env.DB.prepare(
      'INSERT INTO backups (backup_key, session_id, updated_at, payload) VALUES (?1,?2,?3,?4) ' +
        'ON CONFLICT(backup_key, session_id) DO UPDATE SET updated_at=?3, payload=?4',
    ).bind(key, it.id, Math.floor(it.updatedAt) || 0, it.payload),
  )
  await env.DB.batch(stmts)
  return clean.length
}

export async function getBackups(env: Env, key: string): Promise<BackupItem[]> {
  const rs = await env.DB.prepare(
    'SELECT session_id, updated_at, payload FROM backups WHERE backup_key = ?1 ORDER BY updated_at DESC LIMIT 500',
  )
    .bind(key)
    .all<{ session_id: string; updated_at: number; payload: string }>()
  return (rs.results ?? []).map((r) => ({ id: r.session_id, payload: r.payload, updatedAt: r.updated_at }))
}
