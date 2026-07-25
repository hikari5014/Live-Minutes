import type { Env } from './types'
import { translate } from './deepl'
import { generateMinutes } from './gemini'
import { grantDeepgramToken } from './deepgram'
import { getUsage } from './usage'
import { putBackups, getBackups, validKey, type BackupItem } from './backup'
import { getSessionFromD1, getTranscriptFromD1, saveMinutesToD1 } from './db'
import { MeetingRoom } from './room'

export { MeetingRoom }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

// Same-origin gate: block cross-site browser calls (which always send Origin).
// Requests with no Origin (non-browser / same-origin) pass and are rate-limited.
function allowedOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  try {
    return new URL(origin).host === url.host
  } catch {
    return false
  }
}

async function rateLimited(request: Request, env: Env): Promise<boolean> {
  const rl = env.RATE_LIMITER
  if (!rl) return false
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'anon'
  try {
    const { success } = await rl.limit({ key: ip })
    return !success
  } catch {
    return false
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url)
    return env.ASSETS.fetch(request)
  },
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname

  if (p === '/api/health') return json({ ok: true })

  // Abuse protection: reject cross-origin browser calls (when Origin is sent),
  // and rate-limit per IP so nobody can drain paid quota via the public URL.
  if (!allowedOrigin(request, url)) return json({ error: 'forbidden origin' }, 403)
  if (await rateLimited(request, env)) return json({ error: 'rate limited' }, 429)

  if (request.method === 'GET' && p === '/api/usage') return json(await getUsage(env))

  // WebSocket room -> Durable Object
  const roomMatch = p.match(/^\/api\/room\/([^/]+)$/)
  if (roomMatch) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
    const stub = env.ROOMS.get(env.ROOMS.idFromName(roomMatch[1]))
    return stub.fetch(request)
  }

  if (request.method === 'POST' && p === '/api/translate') {
    const body = (await request.json().catch(() => ({}))) as { text?: string; source?: string; target?: string }
    if (!body.text || !body.target) return json({ error: 'text and target required' }, 400)
    try {
      const r = await translate(env, body.text, body.source ?? '', body.target)
      return json({ translation: r.text, detectedSource: r.detected })
    } catch (e) {
      return json({ error: String(e), translation: body.text }, 200)
    }
  }

  if (request.method === 'POST' && p === '/api/minutes') {
    const body = (await request.json().catch(() => ({}))) as {
      transcript?: string
      roomId?: string
      title?: string
      lang?: string
    }
    let transcript = body.transcript
    let title = body.title ?? '會議紀錄'
    if (!transcript && body.roomId) {
      transcript = (await getTranscriptFromD1(env, body.roomId)) ?? undefined
      const s = await getSessionFromD1(env, body.roomId).catch(() => null)
      if (s) title = s.meta.title
    }
    if (!transcript) return json({ error: 'no transcript' }, 400)
    try {
      const doc = await generateMinutes(env, transcript, title, body.lang ?? 'zh-Hant')
      if (body.roomId) await saveMinutesToD1(env, body.roomId, doc).catch(() => undefined)
      return json(doc)
    } catch (e) {
      return json({ error: String(e) }, 502)
    }
  }

  if (request.method === 'POST' && p === '/api/token') {
    try {
      const tok = await grantDeepgramToken(env)
      if (!tok) return json({ error: 'deepgram not configured' }, 501)
      return json(tok)
    } catch (e) {
      return json({ error: String(e) }, 502)
    }
  }

  const sessMatch = p.match(/^\/api\/session\/([^/]+)$/)
  if (request.method === 'GET' && sessMatch) {
    const data = await getSessionFromD1(env, sessMatch[1]).catch(() => null)
    if (!data) return json({ error: 'not found' }, 404)
    return json(data)
  }

  if (p === '/api/backup') {
    if (request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { key?: string; items?: BackupItem[] }
      if (!validKey(body.key) || !Array.isArray(body.items)) return json({ error: 'invalid key or items' }, 400)
      try {
        return json({ ok: true, count: await putBackups(env, body.key, body.items) })
      } catch (e) {
        return json({ error: String(e) }, 500)
      }
    }
    if (request.method === 'GET') {
      const key = url.searchParams.get('key') || ''
      if (!validKey(key)) return json({ error: 'invalid key' }, 400)
      try {
        return json({ items: await getBackups(env, key) })
      } catch (e) {
        return json({ error: String(e) }, 500)
      }
    }
  }

  return json({ error: 'not found' }, 404)
}
