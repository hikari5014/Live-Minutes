import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { SettingsTabs } from '../components/SettingsTabs'
import { ChevronLeft } from '../components/icons'
import { mimeSupportMatrix, supportedMime } from '../lib/recorder'
import { storageInfo, requestPersist, formatBytes, type StorageInfo } from '../lib/storage'
import { transcribeAudio } from '../lib/api'
import { audioSupported } from '../lib/audiodb'

function Row({ k, v, ok }: { k: string; v: ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
      <span className="text-[12.5px] text-muted">{k}</span>
      <span className="text-right text-[12.5px] font-bold" style={{ color: ok === false ? 'var(--live)' : 'var(--ink)' }}>
        {v}
      </span>
    </div>
  )
}

function Card({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-[13.5px] font-extrabold text-ink">{title}</div>
      {desc && <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{desc}</p>}
      <div className="mt-2">{children}</div>
    </section>
  )
}

export default function Diagnostics() {
  const nav = useNavigate()
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [persisting, setPersisting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => storageInfo().then(setInfo)
  useEffect(() => {
    refresh()
  }, [])

  const mime = supportedMime()
  const matrix = mimeSupportMatrix()
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches

  // End-to-end check: record 4s on THIS device, upload, and see what Gemini
  // returns. This is the only reliable answer to "does my recording format work".
  async function runEndToEnd() {
    setTesting(true)
    setResult(null)
    setError(null)
    let stream: MediaStream | null = null
    try {
      if (!mime) throw new Error('此瀏覽器不支援 MediaRecorder 錄音')
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48_000 })
      const parts: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
      const done = new Promise<void>((r) => (rec.onstop = () => r()))
      rec.start()
      await new Promise((r) => setTimeout(r, 4000))
      rec.stop()
      await done
      const blob = new Blob(parts, { type: mime })
      const r = await transcribeAudio(blob, mime, { prompt: '請逐字聽寫這段音訊（繁體中文）。若沒有語音，只回答「（無語音）」。' })
      setResult(`✅ 格式 ${mime} 可用\n檔案 ${formatBytes(blob.size)}（4 秒）\nGemini 回覆：${r.text || '（空）'}`)
    } catch (e) {
      setError(`❌ 測試失敗：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      stream?.getTracks().forEach((t) => t.stop())
      setTesting(false)
      refresh()
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="診斷" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-12">
        <button onClick={() => nav('/settings')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          設定
        </button>
        <h1 className="mb-4 mt-2 text-xl font-extrabold text-ink">裝置診斷</h1>
        <SettingsTabs />

        <div className="grid gap-3">
          <Card title="儲存空間" desc="瀏覽器配額因平台而異；常駐權限可降低被系統清除的風險。">
            <Row k="已使用" v={info ? formatBytes(info.usage) : '…'} />
            <Row k="可用配額" v={info ? formatBytes(info.quota) : '…'} />
            <Row k="常駐儲存" v={info?.persisted ? '已授權' : '未授權'} ok={info?.persisted !== false} />
            <Row k="安裝為 App" v={standalone ? '是' : '否（建議加入主畫面）'} ok={standalone} />
            {!info?.persisted && (
              <button
                onClick={async () => {
                  setPersisting(true)
                  await requestPersist()
                  await refresh()
                  setPersisting(false)
                }}
                disabled={persisting}
                className="mt-3 w-full rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white disabled:opacity-60"
              >
                {persisting ? '申請中…' : '申請常駐儲存'}
              </button>
            )}
          </Card>

          <Card title="錄音格式支援" desc="App 會自動選用第一個支援的格式。">
            <Row k="將使用" v={mime ?? '不支援錄音'} ok={!!mime} />
            <Row k="IndexedDB + MediaRecorder" v={audioSupported() ? '可用' : '不可用'} ok={audioSupported()} />
            <div className="mt-2 grid gap-1">
              {matrix.map((m) => (
                <div key={m.mime} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <code className="min-w-0 flex-1 truncate text-muted">{m.mime}</code>
                  <span className="flex-none font-bold" style={{ color: m.ok ? 'var(--ok)' : 'var(--faint)' }}>
                    {m.ok ? '✓' : '—'}
                  </span>
                </div>
              ))}
            </div>
            {isIOS && <p className="mt-2 text-[11px] text-warn">iOS：Web Speech 即時字幕不穩定，錄音格式通常為 mp4/aac。</p>}
          </Card>

          <Card title="端到端測試" desc="在這台裝置錄 4 秒 → 上傳 → 由 Gemini 聽寫。這是驗證「你的錄音格式能不能被 AI 讀懂」最可靠的方法。">
            <button
              onClick={runEndToEnd}
              disabled={testing || !mime}
              className="w-full rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white disabled:opacity-60"
            >
              {testing ? '錄音並上傳中…（約 6 秒）' : '執行端到端測試'}
            </button>
            {testing && <p className="mt-2 text-center text-[12px] text-muted">請對著麥克風說幾句話…</p>}
            {result && (
              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-ink">
                {result}
              </pre>
            )}
            {error && <p className="mt-3 text-[12.5px] text-live">{error}</p>}
          </Card>

          <Card title="環境">
            <Row k="App 版本" v={`v${__APP_VERSION__}`} />
            <Row k="平台" v={isIOS ? 'iOS' : navigator.platform || '—'} />
            <Row k="語音辨識 (Web Speech)" v={'SpeechRecognition' in window || 'webkitSpeechRecognition' in window ? '支援' : '不支援'} />
          </Card>
        </div>
      </main>
    </div>
  )
}
