import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { TopBar } from '../components/TopBar'
import { ChevronLeft, Sparkles } from '../components/icons'
import { Toggle } from '../components/Toggle'
import {
  probeFile,
  beginImportJob,
  runImportJob,
  loadJob,
  clearJob,
  takeSharedFile,
  clock,
  ACCEPTED_EXT,
  MAX_UPLOAD_BYTES,
  type FileProbe,
  type ImportProgress,
  type ImportJob,
  type ImportResult,
} from '../lib/importaudio'
import { storeImportedFile } from '../lib/audiodb'
import { saveSession, saveMinutes, getBackupKey, exportOne } from '../lib/history'
import { requestMinutesFromTranscript, pushBackup } from '../lib/api'
import { requestPersist } from '../lib/storage'
import { formatBytes } from '../lib/storage'
import { transcriptText } from '../lib/minutes'
import { genRoomId } from '../lib/engine'
import type { SessionMeta } from '../lib/types'

const MINUTES_LANGS = [
  { v: 'zh-Hant', label: '繁體中文' },
  { v: 'zh-Hans', label: '简体中文' },
  { v: 'en', label: 'English' },
  { v: 'ja', label: '日本語' },
  { v: 'ko', label: '한국어' },
  { v: 'de', label: 'Deutsch' },
  { v: 'fr', label: 'Français' },
  { v: 'es', label: 'Español' },
]

export default function Import() {
  const nav = useNavigate()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [probe, setProbe] = useState<FileProbe | null>(null)
  const [probing, setProbing] = useState(false)
  const [queue, setQueue] = useState<File[]>([]) // extra files for batch import
  const [batchAt, setBatchAt] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [keepAudio, setKeepAudio] = useState(true)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [resumable, setResumable] = useState<ImportJob | null>(null)

  // A job that died mid-transcription can continue from the uploaded file URI
  // without re-uploading, as long as the upload hasn't expired.
  useEffect(() => {
    setResumable(loadJob())
    // Arriving from another app's share sheet: the service worker stashed the
    // file for us, so load it straight into the picker.
    if (new URLSearchParams(window.location.search).get('shared')) {
      void takeSharedFile().then((f) => {
        if (f) void pick([f])
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pick(list: FileList | File[] | null) {
    setError(null)
    setProbe(null)
    const files = list ? Array.from(list) : []
    setFile(files[0] ?? null)
    setQueue(files.slice(1))
    if (!files.length) return
    setProbing(true)
    const p = await probeFile(files[0])
    setProbe(p)
    setProbing(false)
    setTitle(files[0].name.replace(/\.[^.]+$/, ''))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void pick(e.dataTransfer.files ?? null)
  }

  // Turn a finished job into a normal saved meeting. Returns its id; the caller
  // decides whether to navigate (single import) or continue the queue (batch).
  async function finish(job: ImportJob, res: ImportResult, navigate = true) {
    const meta: SessionMeta = {
      id: job.sessionId,
      title: job.title,
      createdAt: job.createdAt,
      durationSec: Math.round(res.durationSec),
      sourceLang: settings.sourceLang,
      targetLang: 'none',
      speakers: new Set(res.utterances.map((u) => u.speaker)).size,
      hasMinutes: false,
      speakerNames: res.speakerNames,
    }
    saveSession(meta, res.utterances)

    if (job.generateMinutes) {
      setProgress({ phase: 'merge', done: 1, total: 1, label: '生成會議紀錄' })
      const doc = await requestMinutesFromTranscript(transcriptText(res.utterances, false), meta.title, job.opts.lang, {
        participants: job.opts.participants,
        glossary: job.opts.glossary,
      }).catch(() => null)
      if (doc) saveMinutes(job.sessionId, doc)
    }

    const bkey = getBackupKey()
    if (bkey) {
      const blob = exportOne(job.sessionId)
      if (blob) void pushBackup(bkey, [blob])
    }
    clearJob()
    if (navigate) {
      setProgress(null)
      nav(`/minutes/${job.sessionId}`)
    }
  }

  /** Process one file end to end. Used by both single and batch paths. */
  async function processOne(f: File, p: FileProbe, name: string, navigate: boolean) {
    const id = genRoomId()
    if (keepAudio) {
      void requestPersist()
      await storeImportedFile(id, f, {
        title: name,
        mime: p.mime,
        durationMs: Math.round(p.durationSec * 1000),
        createdAt: Date.now(),
      }).catch(() => undefined)
    }
    const job = await beginImportJob(
      f,
      p,
      { sessionId: id, title: name, generateMinutes: settings.generateMinutes },
      { lang: settings.minutesLang, participants: settings.participants, glossary: settings.glossary },
      setProgress,
    )
    const res = await runImportJob(job, setProgress)
    if (!res.utterances.length) throw new Error('辨識結果為空——這個檔案可能沒有語音內容，或格式無法解讀')
    await finish(job, res, navigate)
  }

  async function run() {
    if (!file || !probe) return
    setError(null)
    const batch = [file, ...queue]
    try {
      if (batch.length === 1) {
        await processOne(file, probe, title.trim() || file.name, true)
        return
      }
      // Batch: each file becomes its own meeting; skip ones we can't handle.
      const skipped: string[] = []
      for (let i = 0; i < batch.length; i++) {
        const f = batch[i]
        setBatchAt(i)
        const p = i === 0 ? probe : await probeFile(f)
        if (p.tooBig || p.unsupported) {
          skipped.push(f.name)
          continue
        }
        await processOne(f, p, f.name.replace(/\.[^.]+$/, ''), false)
      }
      setBatchAt(null)
      setProgress(null)
      if (skipped.length) setError(`已完成，但略過 ${skipped.length} 個無法處理的檔案：${skipped.join('、')}`)
      else nav('/')
    } catch (e) {
      setBatchAt(null)
      setProgress(null)
      setResumable(loadJob())
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function resume(job: ImportJob) {
    setError(null)
    setResumable(null)
    try {
      const res = await runImportJob(job, setProgress)
      if (!res.utterances.length) throw new Error('辨識結果為空')
      await finish(job, res)
    } catch (e) {
      setProgress(null)
      setResumable(loadJob())
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const blocked = !!probe && (probe.tooBig || probe.unsupported)
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="匯入錄音" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-12">
        <button onClick={() => nav('/')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          首頁
        </button>
        <h1 className="mt-2 text-xl font-extrabold text-ink">匯入錄音</h1>
        <p className="mb-4 mt-1 text-[12.5px] text-muted">
          把既有的會議錄音丟進來，AI 會一次讀完、分辨講者，產出逐字稿與會議紀錄——不需要現場開著 App。
        </p>

        {progress ? (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-ink" />
              <span className="text-[14px] font-extrabold text-ink">處理中</span>
            </div>
            {batchAt !== null && (
              <div className="mt-2 text-[12px] font-bold text-zh-ink">
                批次處理：第 {batchAt + 1}／{queue.length + 1} 個檔案
              </div>
            )}
            <div className="mt-3 text-[13px] font-bold text-brand-ink">{progress.label}…</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--brand)' }} />
            </div>
            <p className="mt-2 text-[11.5px] text-muted">長檔需要一些時間，請保持此頁開啟。</p>
            {progress.partial && progress.partial.length > 0 && (
              <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-line bg-paper p-3">
                <div className="mb-1 text-[11px] font-bold text-faint">已完成 {progress.partial.length} 句</div>
                {progress.partial.slice(-8).map((u) => (
                  <div key={u.id} className="mt-1 text-[12px] text-body">
                    <span className="font-mono text-[10px] text-faint">{clock(u.ts / 1000)}</span> {u.source}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {resumable && (
              <div className="mb-3 rounded-xl border border-line p-3" style={{ borderLeft: '4px solid var(--warn)', background: 'var(--warn-tint)' }}>
                <div className="text-[13px] font-extrabold" style={{ color: 'var(--warn)' }}>
                  有一份未完成的匯入
                </div>
                <p className="mt-1 text-[12px] text-body">
                  「{resumable.title}」已完成 {resumable.nextWindow}/{resumable.windows.length || 1} 段。
                  音檔已在雲端暫存，可直接續做，<b>不必重新上傳</b>。
                </p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => resume(resumable)} className="flex-1 rounded-lg bg-brand py-2 text-[12.5px] font-extrabold text-white">
                    繼續處理
                  </button>
                  <button
                    onClick={() => {
                      clearJob()
                      setResumable(null)
                    }}
                    className="rounded-lg border border-line bg-surface px-3 text-[12.5px] font-bold text-muted"
                  >
                    捨棄
                  </button>
                </div>
              </div>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed p-7 text-center transition-colors"
              style={{
                borderColor: dragging ? 'var(--brand)' : 'var(--border-strong)',
                background: dragging ? 'var(--brand-tint)' : 'color-mix(in srgb, var(--brand-tint) 35%, transparent)',
              }}
            >
              <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 34 }}>
                graphic_eq
              </span>
              <div className="mt-1.5 text-[14px] font-extrabold text-ink">
                {file ? (queue.length ? `${file.name} 等 ${queue.length + 1} 個檔案` : file.name) : '選擇或拖放音檔'}
              </div>
              <div className="mt-1 text-[11.5px] text-faint">
                {ACCEPTED_EXT.slice(0, 6).join(' · ')}　|　單檔上限 {formatBytes(MAX_UPLOAD_BYTES)}　|　可多選
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*,video/*"
                multiple
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => void pick(e.target.files)}
              />
            </div>

            {probing && <p className="mt-3 text-center text-[12.5px] text-muted">讀取檔案資訊…</p>}

            {probe && (
              <>
                <div className="mt-3 rounded-xl border border-line bg-surface p-3">
                  <div className="flex justify-between text-[12.5px]">
                    <span className="text-muted">時長</span>
                    <span className="tnum font-bold text-ink">{probe.durationSec ? clock(probe.durationSec) : '未知'}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-[12.5px]">
                    <span className="text-muted">大小</span>
                    <span className="tnum font-bold text-ink">{formatBytes(probe.size)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-[12.5px]">
                    <span className="text-muted">預估用量</span>
                    <span className="tnum font-bold text-brand-ink">
                      {probe.tokenEstimate ? `約 ${probe.tokenEstimate.toLocaleString()} tokens` : '—'}
                    </span>
                  </div>
                </div>

                {probe.tooBig && (
                  <div className="mt-2 rounded-xl border border-line px-3 py-2 text-[12.5px]" style={{ borderLeft: '4px solid var(--live)', background: 'var(--live-tint)', color: 'var(--live)' }}>
                    <b>檔案超過 {formatBytes(MAX_UPLOAD_BYTES)} 上限，無法上傳。</b>
                    <div className="mt-1.5 text-body">可以這樣處理：</div>
                    <ul className="ml-4 mt-1 list-disc text-body">
                      <li>若是影片，先轉成純音訊（m4a／mp3），通常可縮到十分之一以下</li>
                      <li>若已是音訊，用較低位元率重新編碼（語音 64kbps 就很夠）</li>
                      <li>或把錄音分割成數段，逐段匯入——每段都會各自成為一場會議</li>
                    </ul>
                  </div>
                )}
                {probe.unsupported && !probe.tooBig && (
                  <div className="mt-2 rounded-xl border border-line px-3 py-2 text-[12.5px]" style={{ borderLeft: '4px solid var(--live)', background: 'var(--live-tint)', color: 'var(--live)' }}>
                    看起來不是音訊或影片檔。支援：{ACCEPTED_EXT.join('、')}
                  </div>
                )}
                {probe.isVideo && !probe.tooBig && (
                  <div className="mt-2 rounded-xl border border-line px-3 py-2 text-[12.5px]" style={{ borderLeft: '4px solid var(--warn)', background: 'var(--warn-tint)', color: 'var(--warn)' }}>
                    這是影片檔。可以處理，但<b>影像會大幅增加額度消耗</b>；若能先轉成純音訊（m4a／mp3）會省很多。
                  </div>
                )}
              </>
            )}

            <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="會議標題"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-faint"
              />
              <input
                value={settings.participants}
                onChange={(e) => setSettings({ participants: e.target.value })}
                placeholder="與會者（逗號分隔）— 大幅提升分辨講者與待辦歸屬"
                className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-faint"
              />
              <input
                value={settings.glossary}
                onChange={(e) => setSettings({ glossary: e.target.value })}
                placeholder="術語表（逗號分隔，選填）"
                className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-faint"
              />
              <div className="mt-2">
                <select
                  value={settings.minutesLang}
                  onChange={(e) => setSettings({ minutesLang: e.target.value })}
                  aria-label="輸出語言"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] font-bold text-ink"
                >
                  {MINUTES_LANGS.map((l) => (
                    <option key={l.v} value={l.v}>
                      輸出語言：{l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 grid gap-3 border-t border-line pt-3">
                <Toggle checked={settings.generateMinutes} onChange={(v) => setSettings({ generateMinutes: v })} label="產生 AI 會議紀錄" hint="關閉則只出逐字稿" />
                <Toggle checked={keepAudio} onChange={setKeepAudio} label="保留音檔在本機" hint="可點句回放與重跑；依保留期限自動清理" />
              </div>
            </section>

            <button
              onClick={run}
              disabled={!file || !probe || blocked}
              className="mt-4 w-full rounded-xl bg-brand py-3 text-[14px] font-extrabold text-white disabled:opacity-50"
            >
              開始辨識並產生紀錄
            </button>
            {error && <p className="mt-2 text-[12.5px] text-live">處理失敗：{error}</p>}
            <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
              音檔僅在處理當下上傳辨識，伺服器不留存。請確認你已取得錄音與處理該內容的同意。
            </p>
          </>
        )}
      </main>
    </div>
  )
}
