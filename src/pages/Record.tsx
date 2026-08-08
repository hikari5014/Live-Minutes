import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { TopBar } from '../components/TopBar'
import { RecordWave } from '../components/RecordWave'
import { Toggle } from '../components/Toggle'
import { ChevronLeft, Mic, Pause, Play, Sparkles, Stop } from '../components/icons'
import { MeetingRecorder, supportedMime, type RecorderStatus } from '../lib/recorder'
import { startKeepalive, type Keepalive } from '../lib/keepalive'
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

export default function Record() {
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
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: settings.echoCancel, noiseSuppression: settings.echoCancel, channelCount: 1 },
      })
    } catch {
      setError('無法取得麥克風權限，請於瀏覽器設定允許後重試。')
      return
    }
    streamRef.current = stream
    try {
      keepRef.current = await startKeepalive(stream)
      setAnalyser(keepRef.current.analyser)
    } catch {
      /* waveform/背景保活失敗不擋錄音 */
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
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="錄音" />
      <main className="safe-b mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10">
        {phase === 'idle' && (
          <>
            <button onClick={() => nav('/')} className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-muted">
              <ChevronLeft className="h-4 w-4" />
              首頁
            </button>
            <h1 className="mt-2 text-xl font-extrabold text-ink">純錄音模式</h1>
            <p className="mt-1 text-[12.5px] text-muted">
              不出即時字幕，只專心錄音；按結束後才交給 AI 產出逐字稿與會議紀錄。
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

            <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="標題（可留空，自動以時間命名）"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-faint"
              />
              <input
                value={settings.participants}
                onChange={(e) => setSettings({ participants: e.target.value })}
                placeholder="與會者（逗號分隔）— 大幅提升分辨講者準確度"
                className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-faint"
              />
              <div className="mt-3 border-t border-line pt-3">
                <Toggle
                  checked={settings.generateMinutes}
                  onChange={(v) => setSettings({ generateMinutes: v })}
                  label="結束後生成 AI 會議紀錄"
                  hint="關閉則只產出逐字稿"
                />
              </div>
              <button onClick={() => nav('/settings/ai')} className="mt-3 flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-left">
                <span className="text-[12px] text-muted">AI 處理模型</span>
                <span className="text-[12px] font-bold text-brand-ink">{llmLabel()} ›</span>
              </button>
            </section>

            <button
              type="button"
              onClick={start}
              className="mx-auto mt-8 grid h-36 w-36 place-items-center rounded-full text-white shadow-lg"
              style={{
                background: 'radial-gradient(120% 120% at 40% 30%, var(--live) 0%, #a51f26 100%)',
                boxShadow: '0 12px 30px color-mix(in srgb, var(--live) 45%, transparent)',
              }}
            >
              <span className="grid place-items-center gap-1">
                <Mic className="h-8 w-8" />
                <span className="text-[13.5px] font-extrabold tracking-wide">開始錄音</span>
              </span>
            </button>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">
              支援背景錄音：切到其他 App 或關閉螢幕仍會繼續。
              <br />
              Android 穩定；iPhone 以無聲音訊保持喚醒，若仍被系統中斷，
              內容<b>每 5 秒自動存檔</b>、回來即可續處理。
            </p>
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

            <div className="mt-8 rounded-2xl border border-line bg-surface px-3 py-2">
              <RecordWave analyser={analyser} paused={paused} />
            </div>

            <p className="mt-3 text-center text-[11.5px] text-faint">
              已存檔 {formatBytes(stat?.bytes ?? 0)} · 每 5 秒自動寫入本機，關閉螢幕仍持續錄音
            </p>

            <div className="mt-auto flex gap-2.5 pb-4 pt-8">
              <button
                type="button"
                onClick={togglePause}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface py-3.5 text-sm font-bold text-zh-ink"
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? '繼續' : '暫停'}
              </button>
              <button
                type="button"
                onClick={stopAndProcess}
                className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-extrabold text-white"
                style={{ background: 'var(--live)', boxShadow: '0 6px 16px color-mix(in srgb, var(--live) 40%, transparent)' }}
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
              <button onClick={() => nav('/')} className="rounded-xl border border-line bg-surface px-4 text-[13px] font-bold text-muted">
                稍後再處理
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
