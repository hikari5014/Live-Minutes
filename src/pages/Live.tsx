import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { engine } from '../lib/engine'
import { CaptionStream } from '../components/Captions'
import { Wave } from '../components/Wave'
import { Share, Stop, Users, Check } from '../components/icons'
import { mmss } from '../lib/format'

export default function Live() {
  const nav = useNavigate()
  const status = useStore((s) => s.status)
  const utterances = useStore((s) => s.utterances)
  const interim = useStore((s) => s.interim)
  const elapsedSec = useStore((s) => s.elapsedSec)
  const viewers = useStore((s) => s.viewers)
  const error = useStore((s) => s.error)
  const settings = useStore((s) => s.settings)
  const roomId = useStore((s) => s.roomId)
  const backendReady = useStore((s) => s.backendReady)
  const [copied, setCopied] = useState(false)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const st = useStore.getState()
    if (st.status === 'idle' || !st.roomId) nav('/', { replace: true })
  }, [nav])

  async function onShare() {
    const url = `${window.location.origin}/m/${roomId}`
    const navAny = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (navAny.share) {
      try {
        await navAny.share({ title: 'Live Minutes', text: '加入我的即時會議字幕', url })
      } catch {
        /* cancelled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch {
        /* ignore */
      }
    }
  }

  async function onStop() {
    setStopping(true)
    const meta = await engine.stop()
    nav(`/minutes/${meta.id}`)
  }

  const showTranslation = settings.targetLang !== 'none'
  const showFrontendNote = showTranslation && !backendReady

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <div
        className="safe-t sticky top-0 z-20 border-b border-line backdrop-blur"
        style={{ background: 'color-mix(in srgb, var(--paper) 85%, transparent)' }}
      >
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-2.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-extrabold text-live"
            style={{ background: 'var(--live-tint)' }}
          >
            <span className="relative h-2 w-2 rounded-full bg-live">
              <span
                className="absolute inset-0 rounded-full"
                style={{ animation: 'ping 1.8s cubic-bezier(0,0,.2,1) infinite', border: '2px solid var(--live)' }}
              />
            </span>
            {status === 'connecting' ? '連線中' : 'LIVE'}
          </span>
          <Wave active={status === 'live'} />
          {viewers > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
              <Users className="h-4 w-4" />
              {viewers}
            </span>
          )}
          <span className="tnum ml-auto font-mono text-[13px] font-bold text-ink">{mmss(elapsedSec)}</span>
        </div>
      </div>

      {error && (
        <div className="mx-auto w-full max-w-md px-4 pt-3">
          <div
            className="rounded-xl border border-line px-3 py-2 text-[13px]"
            style={{ borderLeft: '4px solid var(--live)', background: 'var(--live-tint)', color: 'var(--live)' }}
          >
            {error}
          </div>
        </div>
      )}
      {showFrontendNote && !error && (
        <div className="mx-auto w-full max-w-md px-4 pt-3">
          <div
            className="rounded-xl border border-line px-3 py-2 text-[12.5px] text-body"
            style={{ borderLeft: '4px solid var(--brand)', background: 'var(--brand-tint)' }}
          >
            純前端模式：僅顯示原文。翻譯與跨裝置同步需連上後端服務。
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
        <CaptionStream utterances={utterances} interim={interim} showTranslation={showTranslation} />
      </div>

      <div className="safe-b mx-auto w-full max-w-md px-4 pb-5">
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onShare}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface py-3 text-sm font-bold text-ink"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-ok" />
                已複製連結
              </>
            ) : (
              <>
                <Share className="h-4 w-4" />
                分享連結
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-70"
            style={{ background: 'var(--live)', boxShadow: '0 6px 16px color-mix(in srgb, var(--live) 40%, transparent)' }}
          >
            <Stop className="h-4 w-4" />
            {stopping ? '結束中…' : '結束會議'}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-faint">請保持螢幕開啟，避免 iOS 背景中斷錄音</p>
      </div>
    </div>
  )
}
