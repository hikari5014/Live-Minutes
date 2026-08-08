import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { TopBar } from '../components/TopBar'
import { RecordWave } from '../components/RecordWave'
import { Toggle } from '../components/Toggle'
import { Mic, Pause, Play, Sparkles, Stop } from '../components/icons'
import { MeetingRecorder, supportedMime, type RecorderStatus } from '../lib/recorder'
import { createAudioContext, attachKeepalive, backgroundRecordingBlocked, type Keepalive } from '../lib/keepalive'
import { enableWakeLock, disableWakeLock } from '../lib/wakelock'
import { buildAuthoritativeTranscript, type BuildProgress } from '../lib/authoritative'
import { getRecording, deleteRecording, audioSupported } from '../lib/audiodb'
import { llmMinutes, llmLabel } from '../lib/llm'
import { saveSession, saveMinutes, getBackupKey, exportOne } from '../lib/history'
import { pushBackup } from '../lib/api'
import { requestPersist, formatBytes } from '../lib/storage'
import { transcriptText } from '../lib/minutes'
import { clock } from '../lib/importaudio'
import { genRoomId } from '../lib/engine'
import type { SessionMeta } from '../lib/types'

const PENDING_KEY = 'lm-record-pending'

interface Pending {
  id: string
  title: string
  createdAt: number
}

function readPending(): Pending | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as Pending) : null
  } catch {
    return null
  }
}

function defaultTitle(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `錄音 ${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

type Phase = 'idle' | 'rec' | 'processing' | 'error'

export function RecordPane({ onRecordingChange }: { onRecordingChange?: (b: boolean) => void } = {}) {
  const nav = useNavigate()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)

  const [phase, setPhase] = useState<Phase>('idle')
  const [title, setTitle] = useState('')
  const [paused, setPaused] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stat, setStat] = useState<RecorderStatus | null>(null)
  const [prog, setProg] = useState<BuildProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const iosLike = backgroundRecordingBlocked()

  useEffect(() => {
    onRecordingChange?.(phase === 'rec')
  }, [phase, onRecordingChange])

  const recRef = useRef<MeetingRecorder | null>(null)
  const keepRef = useRef<Keepalive | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const idRef = useRef('')
  const t0Ref = useRef(0)
  const pausedMsRef = useRef(0)
  const pauseStartRef = useRef(0)

  // A recording that never finished processing (crash, closed tab, failed AI
  // pass) is still fully saved locally — offer to pick it up.
  useEffect(() => {
    const p = readPending()
    if (!p) return
    getRecording(p.id)
      .then((r) => {
        if (r && r.bytes > 0) setPending(p)
        else localStorage.removeItem(PENDING_KEY)
      })
      .catch(() => undefined)
  }, [])

  // Timer from the real clock (background timers are throttled; the clock isn't).
  useEffect(() => {
    if (phase !== 'rec') return
    const t = window.setInterval(() => {
      const until = paused ? pauseStartRef.current : Date.now()
      setElapsedMs(Math.max(0, until - t0Ref.current - pausedMsRef.current))
      const keep = keepRef.current
      if (keep) {
        keep.kick()
        setAudioBlocked(keep.suspended())
      }
    }, 250)
    return () => clearInterval(t)
  }, [phase, paused])

  function teardownAudio() {
    keepRef.current?.stop()
    keepRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setAnalyser(null)
    void disableWakeLock()
  }

  // Leaving the page mid-recording: finalize what we have (it stays recoverable
  // via the pending banner) instead of recording into a dead page.
  useEffect(
    () => () => {
      if (recRef.current?.active) void recRef.current.stop()
      teardownAudio()
    },
    [],
  )

  async function start() {
    setError(null)
    if (!audioSupported() || !supportedMime()) {
      setError('此瀏覽器不支援錄音（MediaRecorder／IndexedDB 不可用）')
      return
    }
    // Build the AudioContext synchronously, while still inside the click
    // gesture — after an await iOS treats it as user-less and starts it
    // suspended, which is what leaves the waveform flat.
    const ctx = createAudioContext()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: settings.echoCancel, noiseSuppression: settings.echoCancel, channelCount: 1 },
      })
    } catch {
      void ctx?.close().catch(() => undefined)
      setError('無法取得麥克風權限，請於瀏覽器設定允許後重試。')
      return
    }
    streamRef.current = stream
    if (ctx) {
      try {
        const keep = await attachKeepalive(ctx, stream)
        keepRef.current = keep
        setAnalyser(keep.analyser)
        setAudioBlocked(keep.suspended())
      } catch {
        /* 波形失敗不擋錄音 */
      }
    }

    const id = genRoomId()
    idRef.current = id
    const t = title.trim() || defaultTitle()
    setTitle(t)
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ id, title: t, createdAt: Date.now() } satisfies Pending))
    } catch {
      /* ignore */
    }

    const rec = new MeetingRecorder()
    recRef.current = rec
    const ok = await rec.start(id, t, setStat, stream)
    if (!ok) {
      teardownAudio()
      setError('錄音啟動失敗')
      return
    }
    void requestPersist()
    void enableWakeLock()
    t0Ref.current = Date.now()
    pausedMsRef.current = 0
    setElapsedMs(0)
    setPaused(false)
    setPhase('rec')
  }

  function togglePause() {
    const rec = recRef.current
    if (!rec) return
    if (paused) {
      pausedMsRef.current += Date.now() - pauseStartRef.current
      rec.resume()
      setPaused(false)
    } else {
      pauseStartRef.current = Date.now()
      rec.pause()
      setPaused(true)
    }
  }

  async function stopAndProcess() {
    const rec = recRef.current
    if (!rec) return
    setPhase('processing')
    setProg({ done: 0, total: 1, label: '收尾與存檔' })
    const finalTitle = title.trim() || defaultTitle()
    const meta = await rec.stop(finalTitle).catch(() => null)
    recRef.current = null
    teardownAudio()
    await process(idRef.current, finalTitle, meta?.durationMs)
  }

  async function process(id: string, name: string, durationMs?: number) {
    setPhase('processing')
    setError(null)
    try {
      const res = await buildAuthoritativeTranscript(
        id,
        { lang: settings.minutesLang, participants: settings.participants, glossary: settings.glossary },
        setProg,
      )
      if (!res.utterances.length) throw new Error('辨識結果為空——可能沒有收到聲音，或錄音太短')

      const recMeta = await getRecording(id).catch(() => null)
      const meta: SessionMeta = {
        id,
        title: name,
        createdAt: recMeta?.createdAt ?? Date.now(),
        durationSec: Math.round((durationMs ?? recMeta?.durationMs ?? 0) / 1000),
        sourceLang: settings.sourceLang,
        targetLang: 'none',
        speakers: new Set(res.utterances.map((u) => u.speaker)).size,
        hasMinutes: false,
        speakerNames: res.speakerNames,
      }
      saveSession(meta, res.utterances)

      if (settings.generateMinutes) {
        setProg({ done: 1, total: 1, label: '生成會議紀錄' })
        const doc = await llmMinutes(transcriptText(res.utterances, false), name, settings.minutesLang, {
          participants: settings.participants,
          glossary: settings.glossary,
        }).catch(() => null)
        if (doc) saveMinutes(id, doc)
      }

      const bkey = getBackupKey()
      if (bkey) {
        const blob = exportOne(id)
        if (blob) void pushBackup(bkey, [blob])
      }
      try {
        localStorage.removeItem(PENDING_KEY)
      } catch {
        /* ignore */
      }
      nav(`/minutes/${id}`)
    } catch (e) {
      idRef.current = id
      setTitle(name)
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  function discardPending() {
    if (pending) void deleteRecording(pending.id).catch(() => undefined)
    try {
      localStorage.removeItem(PENDING_KEY)
    } catch {
      /* ignore */
    }
    setPending(null)
  }

  const pct = prog ? Math.round((prog.done / Math.max(1, prog.total)) * 100) : 0

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-10">
        {phase === 'idle' && (
          <>
            <h1 className="mt-4 text-[34px] font-extrabold tracking-tight text-ink">錄音</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              不出即時字幕，只專心錄音；結束後交給 AI 產出逐字稿與會議紀錄。
            </p>

            {pending && (
              <div className="mt-4 rounded-xl border border-line p-3" style={{ borderLeft: '4px solid var(--warn)', background: 'var(--warn-tint)' }}>
                <div className="text-[13px] font-extrabold" style={{ color: 'var(--warn)' }}>
                  上次的錄音尚未處理
                </div>
                <p className="mt-1 text-[12px] text-body">「{pending.title}」已完整保存在本機，可直接交給 AI 處理。</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      const p = pending
                      setPending(null)
                      if (p) void process(p.id, p.title)
                    }}
                    className="flex-1 rounded-lg bg-brand py-2 text-[12.5px] font-extrabold text-white"
                  >
                    處理成逐字稿
                  </button>
                  <button onClick={discardPending} className="rounded-lg border border-line bg-surface px-3 text-[12.5px] font-bold text-muted">
                    刪除錄音
                  </button>
                </div>
              </div>
            )}

            <section className="mt-5 rounded-2xl bg-surface p-4 shadow-sm">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="標題（可留空，自動以時間命名）"
                className="w-full rounded-xl bg-surface-2 px-3.5 py-3 text-[15px] text-ink placeholder:text-faint"
              />
              <input
                value={settings.participants}
                onChange={(e) => setSettings({ participants: e.target.value })}
                placeholder="與會者（逗號分隔）— 提升分辨講者準確度"
                className="mt-2 w-full rounded-xl bg-surface-2 px-3.5 py-3 text-[14px] text-ink placeholder:text-faint"
              />
              <div className="mt-3 pt-1">
                <Toggle
                  checked={settings.generateMinutes}
                  onChange={(v) => setSettings({ generateMinutes: v })}
                  label="結束後生成 AI 會議紀錄"
                  hint="關閉則只產出逐字稿"
                />
              </div>
              <button onClick={() => nav('/settings/ai')} className="mt-3 flex w-full items-center justify-between rounded-xl bg-surface-2 px-3.5 py-3 text-left">
                <span className="text-[13px] text-muted">AI 處理模型</span>
                <span className="text-[13px] font-bold text-brand-ink">{llmLabel()} ›</span>
              </button>
            </section>

            <button
              type="button"
              onClick={start}
              aria-label="開始錄音"
              className="mx-auto mt-10 grid h-24 w-24 place-items-center rounded-full text-white transition-transform active:scale-95"
              style={{ background: 'var(--brand)', boxShadow: '0 10px 30px color-mix(in srgb, var(--brand) 40%, transparent)' }}
            >
              <Mic className="h-9 w-9" />
            </button>
            <div className="mt-3 text-center text-[13.5px] font-bold text-ink">開始錄音</div>

            {iosLike ? (
              <div className="mt-6 rounded-xl border border-line p-3" style={{ borderLeft: '4px solid var(--warn)', background: 'var(--warn-tint)' }}>
                <div className="text-[12.5px] font-extrabold" style={{ color: 'var(--warn)' }}>
                  iPhone／iPad：請保持本頁在前景
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-body">
                  iOS <b>不允許</b>網頁在鎖屏或切到其他 App 後繼續錄音（系統層限制，無法以網頁技術繞過）。
                  錄音期間我們會<b>阻止螢幕自動熄滅</b>，請勿按電源鍵或切換 App。
                  <br />
                  需要全程背景錄音，請改用 iOS <b>「語音備忘錄」</b>錄好，再用「匯入錄音檔」交給 AI —— 效果完全相同。
                </p>
                <button onClick={() => nav('/import')} className="mt-2 w-full rounded-lg bg-surface py-2 text-[12px] font-bold text-brand-ink">
                  改用匯入錄音檔 →
                </button>
              </div>
            ) : (
              <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">
                支援背景錄音：切到其他 App 或關閉螢幕通常仍會繼續。
                <br />
                內容<b>每 5 秒自動存檔</b>，即使被系統中斷也只損失數秒、回來即可續處理。
              </p>
            )}
            {error && <p className="mt-3 text-center text-[12.5px] text-live">{error}</p>}
          </>
        )}

        {phase === 'rec' && (
          <>
            <div className="mt-10 flex items-center justify-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-extrabold"
                style={paused ? { background: 'var(--warn-tint)', color: 'var(--warn)' } : { background: 'var(--live-tint)', color: 'var(--live)' }}
              >
                <span className="relative h-2 w-2 rounded-full" style={{ background: paused ? 'var(--warn)' : 'var(--live)' }}>
                  {!paused && (
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ animation: 'ping 1.8s cubic-bezier(0,0,.2,1) infinite', border: '2px solid var(--live)' }}
                    />
                  )}
                </span>
                {paused ? '已暫停' : '錄音中'}
              </span>
            </div>

            <div className="tnum mt-6 text-center font-mono text-[56px] font-bold leading-none text-ink">{clock(elapsedMs / 1000)}</div>
            <div className="mt-1 text-center text-[13px] font-semibold text-muted">{title}</div>

            <div className="mt-8 rounded-2xl bg-surface px-3 py-3 shadow-sm">
              <RecordWave analyser={analyser} paused={paused} />
            </div>

            {audioBlocked && (
              <button onClick={() => keepRef.current?.kick()} className="mt-2 w-full rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: 'var(--warn-tint)', color: 'var(--warn)' }}>
                音訊分析被系統暫停（錄音仍進行中）— 點此恢復波形
              </button>
            )}

            <p className="mt-3 text-center text-[11.5px] text-faint">
              已存檔 {formatBytes(stat?.bytes ?? 0)} · 每 5 秒自動寫入本機
              {iosLike ? ' · 請保持本頁在前景' : ''}
            </p>

            <div className="mt-auto flex gap-2.5 pb-4 pt-8">
              <button
                type="button"
                onClick={togglePause}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-surface py-4 text-[14px] font-bold text-ink shadow-sm active:scale-[.98]"
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? '繼續' : '暫停'}
              </button>
              <button
                type="button"
                onClick={stopAndProcess}
                className="flex flex-[1.4] items-center justify-center gap-2 rounded-full py-4 text-[14px] font-extrabold text-white active:scale-[.98]"
                style={{ background: 'var(--brand)', boxShadow: '0 8px 22px color-mix(in srgb, var(--brand) 38%, transparent)' }}
              >
                <Stop className="h-4 w-4" />
                結束並交給 AI
              </button>
            </div>
          </>
        )}

        {phase === 'processing' && (
          <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-ink" />
              <span className="text-[14px] font-extrabold text-ink">AI 處理中</span>
            </div>
            <p className="mt-1 text-[11.5px] text-faint">{llmLabel()}</p>
            <div className="mt-3 text-[13px] font-bold text-brand-ink">{prog?.label ?? '處理中'}…</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--brand)' }} />
            </div>
            <p className="mt-2 text-[11.5px] text-muted">錄音已完整保存在本機；請保持此頁開啟直到完成。</p>
          </section>
        )}

        {phase === 'error' && (
          <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
            <div className="text-[14px] font-extrabold text-live">處理失敗</div>
            <p className="mt-2 text-[13px] leading-relaxed text-body">{error}</p>
            <p className="mt-2 text-[11.5px] text-faint">錄音檔安全保存在本機（設定 → 錄音），不會遺失。</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void process(idRef.current, title.trim() || defaultTitle())}
                className="flex-1 rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white"
              >
                重試處理
              </button>
              <button onClick={() => setPhase('idle')} className="rounded-xl border border-line bg-surface px-4 text-[13px] font-bold text-muted">
                稍後再處理
              </button>
            </div>
          </section>
        )}
    </div>
  )
}

export default function Record() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="錄音" />
      <RecordPane />
    </div>
  )
}
