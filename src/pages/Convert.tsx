import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { ChevronLeft } from '../components/icons'
import { FormatPicker, loadOpts } from '../components/FormatPicker'
import { convert, saveBlob, baseName, FORMAT_INFO, type ConvertOpts } from '../lib/convert'
import { formatBytes } from '../lib/storage'

interface Job {
  id: string
  file: File
  state: 'queued' | 'working' | 'done' | 'error'
  progress: number
  result?: { blob: Blob; name: string; durationSec: number }
  error?: string
}

const fmtDur = (s: number) => {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

export default function Convert() {
  const nav = useNavigate()
  const [opts, setOpts] = useState<ConvertOpts>(() => loadOpts())
  const [jobs, setJobs] = useState<Job[]>([])
  const [running, setRunning] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)))

  function add(files: FileList | File[]) {
    const list = [...files].filter((f) => f.size > 0)
    setJobs((js) => [...js, ...list.map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, state: 'queued' as const, progress: 0 }))])
  }

  async function runAll() {
    setRunning(true)
    const todo = jobs.filter((j) => j.state !== 'working')
    for (const j of todo) {
      patch(j.id, { state: 'working', progress: 0, error: undefined, result: undefined })
      try {
        const { blob, durationSec } = await convert([async () => j.file], opts, (p) => patch(j.id, { progress: p }))
        const name = `${baseName(j.file.name)}.${FORMAT_INFO[opts.format].ext}`
        patch(j.id, { state: 'done', progress: 1, result: { blob, name, durationSec } })
      } catch (e) {
        patch(j.id, { state: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
    setRunning(false)
  }

  const pending = jobs.some((j) => j.state === 'queued' || j.state === 'error')

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="轉檔" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-16">
        <button onClick={() => nav(-1)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          返回
        </button>
        <h1 className="mt-2 text-[34px] font-extrabold tracking-tight text-ink">音檔轉換</h1>
        <p className="mt-1 text-[13.5px] text-muted">在手機上直接轉檔，檔案不會上傳到任何伺服器。</p>

        <section className="mt-5 rounded-2xl bg-surface p-4 shadow-sm">
          <FormatPicker value={opts} onChange={setOpts} />
        </section>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            add(e.dataTransfer.files)
          }}
          className="mt-3 grid w-full place-items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors"
          style={{ borderColor: drag ? 'var(--brand)' : 'var(--border-strong)', background: drag ? 'var(--brand-tint)' : 'transparent' }}
        >
          <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 30 }}>
            upload_file
          </span>
          <span className="text-[14px] font-bold text-ink">選擇或拖入音檔（可多選）</span>
          <span className="text-[11.5px] text-faint">MP3 · M4A · WAV · AAC · OGG · OPUS · FLAC · WebM · MP4／MOV 影片音軌</span>
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept="audio/*,video/*,.m4a,.aac,.flac,.opus,.ogg,.webm,.amr"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) add(e.target.files)
            e.target.value = ''
          }}
        />

        {jobs.length > 0 && (
          <section className="mt-4 grid gap-2">
            {jobs.map((j) => (
              <div key={j.id} className="rounded-2xl bg-surface p-3.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-ink">{j.file.name}</div>
                    <div className="text-[11.5px] text-faint">
                      {formatBytes(j.file.size)}
                      {j.result && ` → ${formatBytes(j.result.blob.size)} · ${fmtDur(j.result.durationSec)}`}
                    </div>
                  </div>
                  {j.state === 'done' && j.result ? (
                    <button
                      onClick={() => saveBlob(j.result!.blob, j.result!.name)}
                      className="rounded-full px-3.5 py-2 text-[12.5px] font-extrabold text-white"
                      style={{ background: 'var(--brand)' }}
                    >
                      下載
                    </button>
                  ) : j.state !== 'working' ? (
                    <button
                      onClick={() => setJobs((js) => js.filter((x) => x.id !== j.id))}
                      aria-label="移除"
                      className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 17 }}>
                        close
                      </span>
                    </button>
                  ) : null}
                </div>
                {j.state === 'working' && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(j.progress * 100)}%`, background: 'var(--brand)' }} />
                  </div>
                )}
                {j.state === 'error' && <p className="mt-1.5 text-[12px] text-live">{j.error}</p>}
              </div>
            ))}
          </section>
        )}

        {jobs.length > 0 && (
          <button
            onClick={runAll}
            disabled={running || !pending}
            className="mt-4 w-full rounded-full py-3.5 text-[14px] font-extrabold text-white disabled:opacity-50"
            style={{ background: 'var(--brand)', boxShadow: '0 8px 22px color-mix(in srgb, var(--brand) 38%, transparent)' }}
          >
            {running ? '轉換中…' : `轉換為 ${FORMAT_INFO[opts.format].label}`}
          </button>
        )}

        <p className="mt-5 text-[11px] leading-relaxed text-faint">
          使用瀏覽器內建解碼器，支援絕大多數常見格式；WMA、AMR 等少數舊格式瀏覽器無法解碼。
          很長的檔案（例如 2 小時以上）轉檔會佔用較多記憶體，手機上建議選「語音」音質。
        </p>
      </main>
    </div>
  )
}
