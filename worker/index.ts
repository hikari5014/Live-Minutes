import type { Env } from './types'
import { translate } from './deepl'
import { generateMinutes } from './gemini'
import { grantDeepgramToken } from './deepgram'
import { getSessionFromD1, getTranscriptFromD1, saveMinutesToD1 } from './db'
import { MeetingRoom } from './room'

export { MeetingRoom }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
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
      const translation = await translate(env, body.text, body.source ?? '', body.target)
      return json({ translation })
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

  return json({ error: 'not found' }, 404)
}
