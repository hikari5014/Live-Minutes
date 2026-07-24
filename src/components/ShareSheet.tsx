import { useEffect, useState } from 'react'
import { qrDataUrl } from '../lib/qr'
import { Share, X, Users } from './icons'

export function ShareSheet({
  roomId,
  title,
  viewers,
  onClose,
}: {
  roomId: string
  title: string
  viewers: number
  onClose: () => void
}) {
  const url = `${window.location.origin}/m/${roomId}`
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let ok = true
    qrDataUrl(url)
      .then((d) => ok && setQr(d))
      .catch(() => undefined)
    return () => {
      ok = false
    }
  }, [url])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  async function nativeShare() {
    const n = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (n.share) {
      try {
        await n.share({ title: 'Live Minutes', text: '加入我的即時會議字幕', url })
      } catch {
        /* cancelled */
      }
    } else {
      void copy()
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="safe-b relative w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 pb-8 shadow-lg">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong" />
        <div className="flex items-center gap-2">
          <div className="text-base font-extrabold text-ink">分享會議</div>
          <button onClick={onClose} aria-label="關閉" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1 truncate text-[13px] text-muted">{title}</div>

        <div className="mt-4 text-[11px] font-extrabold uppercase tracking-wider text-faint">邀請連結</div>
        <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <code className="flex-1 truncate text-xs text-ink">{url.replace(/^https?:\/\//, '')}</code>
          <button onClick={copy} className="flex-none rounded-lg bg-brand px-2.5 py-1.5 text-[11.5px] font-extrabold text-white">
            {copied ? '已複製' : '複製'}
          </button>
        </div>

        <div className="mt-4 grid place-items-center gap-2">
          {qr ? (
            <img src={qr} alt="會議 QR" className="h-36 w-36 rounded-xl border border-line bg-white p-1.5" />
          ) : (
            <div className="h-36 w-36 rounded-xl border border-line bg-surface-2" />
          )}
          <div className="text-[11.5px] text-muted">掃描 QR 即可加入</div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[12.5px] text-body">
          <Users className="h-4 w-4 text-muted" />
          {viewers > 0 ? `${viewers} 人正在觀看` : '尚無其他觀看者'}
          <span className="ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-extrabold text-ok" style={{ background: 'var(--ok-tint)' }}>
            即時同步
          </span>
        </div>

        <button
          onClick={nativeShare}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-extrabold text-white"
        >
          <Share className="h-4 w-4" />
          分享邀請連結
        </button>
        <p className="mt-2 text-center text-[11px] text-faint">觀看者可自選字幕語言，且不佔用額外辨識額度</p>
      </div>
    </div>
  )
}
