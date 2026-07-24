import type { Env } from './types'

// Mint a short-lived Deepgram token so a client/room can stream directly
// without exposing the long-lived key. Used by the Deepgram ASR upgrade path.
export async function grantDeepgramToken(env: Env): Promise<{ key: string; expiresAt: number } | null> {
  if (!env.DEEPGRAM_API_KEY) return null
  const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: 60 }),
  })
  if (!res.ok) throw new Error(`deepgram grant ${res.status}`)
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error('deepgram grant: no token')
  return { key: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 30) * 1000 }
}
