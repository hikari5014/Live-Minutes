// Room WebSocket client. Host publishes finalized captions; viewers receive
// broadcasts translated to their chosen language. Talks to /api/room/:id.
// Both sides reconnect with exponential backoff; on reconnect the viewer
// re-says hello and the DO replies with a fresh sync (backlog), so a dropped
// connection self-heals instead of freezing the captions.
import type { ClientMsg, ServerMsg, WireCaption } from './protocol'
import type { Interim, TargetLang, Utterance } from './types'

function wsUrl(roomId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/room/${encodeURIComponent(roomId)}`
}

function toUtterance(m: WireCaption): Utterance {
  return { id: m.id, speaker: m.speaker, source: m.source, translation: m.translation, ts: m.ts, final: true }
}

const MAX_RETRIES = 10
const backoff = (n: number) => Math.min(8000, 500 * 2 ** n)

// ---- Host ----
export interface HostRoom {
  publishFinal: (u: Utterance) => void
  publishInterim: (speaker: number | null, source: string) => void
  end: () => void
  close: () => void
}
export interface HostOpts {
  source: string
  target: TargetLang
  title: string
  onViewers: (n: number) => void
  onError?: (message: string) => void
}

export function joinAsHost(roomId: string, opts: HostOpts): HostRoom {
  let ws: WebSocket | null = null
  let open = false
  let closed = false
  let retries = 0
  const queue: ClientMsg[] = []
  const send = (m: ClientMsg) => {
    if (open && ws) ws.send(JSON.stringify(m))
    else {
      queue.push(m)
      if (queue.length > 1000) queue.shift()
    }
  }
  const connect = () => {
    ws = new WebSocket(wsUrl(roomId))
    ws.onopen = () => {
      open = true
      retries = 0
      ws?.send(JSON.stringify({ t: 'hello', role: 'host', source: opts.source, target: opts.target, title: opts.title }))
      queue.splice(0).forEach((m) => ws?.send(JSON.stringify(m)))
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ServerMsg
        if (msg.t === 'meta' || msg.t === 'sync') opts.onViewers(msg.viewers)
      } catch {
        /* ignore */
      }
    }
    ws.onerror = () => opts.onError?.('房間連線發生問題')
    ws.onclose = () => {
      open = false
      if (closed || retries >= MAX_RETRIES) return
      window.setTimeout(connect, backoff(retries++))
    }
  }
  connect()
  return {
    publishFinal: (u) => send({ t: 'final', id: u.id, speaker: u.speaker, source: u.source, ts: u.ts }),
    publishInterim: (speaker, source) => send({ t: 'interim', speaker, source }),
    end: () => send({ t: 'end' }),
    close: () => {
      closed = true
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
      ws = null
    },
  }
}

// ---- Viewer ----
export interface ViewerEvents {
  onCaption: (u: Utterance) => void
  onInterim: (i: Interim | null) => void
  onSync: (list: Utterance[], meta: { title: string; status: string; viewers: number }) => void
  onMeta: (meta: { title: string; status: string; viewers: number }) => void
  onEnded: () => void
  onError: (message: string) => void
}
export interface ViewerRoom {
  setLang: (l: TargetLang) => void
  close: () => void
}

export function joinAsViewer(roomId: string, lang: TargetLang, ev: ViewerEvents): ViewerRoom {
  let ws: WebSocket | null = null
  let open = false
  let closed = false
  let retries = 0
  let curLang: TargetLang = lang
  const send = (m: ClientMsg) => {
    if (open && ws) ws.send(JSON.stringify(m))
  }
  const connect = () => {
    ws = new WebSocket(wsUrl(roomId))
    ws.onopen = () => {
      open = true
      retries = 0
      ws?.send(JSON.stringify({ t: 'hello', role: 'viewer', lang: curLang }))
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ServerMsg
        if (msg.t === 'caption') ev.onCaption(toUtterance(msg))
        else if (msg.t === 'interim')
          ev.onInterim(msg.source ? { speaker: msg.speaker, source: msg.source, translation: msg.translation } : null)
        else if (msg.t === 'sync')
          ev.onSync(msg.utterances.map(toUtterance), { title: msg.title, status: msg.status, viewers: msg.viewers })
        else if (msg.t === 'meta') ev.onMeta({ title: msg.title, status: msg.status, viewers: msg.viewers })
        else if (msg.t === 'ended') ev.onEnded()
      } catch {
        /* ignore */
      }
    }
    ws.onerror = () => ev.onError('房間連線失敗（可能尚未連上後端，或連結無效）')
    ws.onclose = () => {
      open = false
      if (closed || retries >= MAX_RETRIES) return
      window.setTimeout(connect, backoff(retries++))
    }
  }
  connect()
  return {
    setLang: (l) => {
      curLang = l
      send({ t: 'lang', lang: l })
    },
    close: () => {
      closed = true
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
      ws = null
    },
  }
}
