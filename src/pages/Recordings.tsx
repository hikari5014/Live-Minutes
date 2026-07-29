import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { TopBar } from '../components/TopBar'
import { SettingsTabs } from '../components/SettingsTabs'
import { ChevronLeft } from '../components/icons'
import {
  listRecordings,
  deleteRecording,
  listSegments,
  getSegmentBlob,
  pruneOlderThan,
  type RecordingMeta,
} from '../lib/audiodb'
import { storageInfo, formatBytes, type StorageInfo } from '../lib/storage'
import { shortDate } from '../lib/format'

const RETENTION = [
  { v: 0, label: '永久' },
  { v: 7, label: '7 天' },
  { v: 30, label: '30 天' },
  { v: 90, label: '90 天' },
]

export default function Recordings() {
  const nav = useNavigate()
  const s = useStore((st) => st.settings)
  const set = useStore((st) => st.setSettings)
  const [rev, setRev] = useState(0)
  const [recs, setRecs] = useState<RecordingMeta[]>([])
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const bump = () => setRev((x) => x + 1)

  useEffect(() => {
    listRecordings().then(setRecs)
    storageInfo().then(setInfo)
  }, [rev])

  // Release any object URL we created for playback/export.
  useEffect(() => () => { if (playing) URL.revokeObjectURL(playing.url) }, [playing])

  const totalBytes = useMemo(() => recs.reduce((n, r) => n + r.bytes, 0), [recs])

  async function assemble(r: RecordingMeta): Promise<Blob | null> {
    const segs = await listSegments(r.sessionId)
    const blobs: Blob[] = []
    for (const seg of segs) {
      const b = await getSegmentBlob(r.sessionId, seg.seg, seg.mime)
      if (b) blobs.push(b)
    }
    return blobs.length ? new Blob(blobs, { type: r.mime }) : null
  }

  async function play(r: RecordingMeta) {
    setBusy(r.sessionId)
    const blob = await assemble(r)
    setBusy(null)
    if (!blob) return
    if (playing) URL.revokeObjectURL(playing.url)
    setPlaying({ id: r.sessionId, url: URL.createObjectURL(blob) })
  }

  async function exportFile(r: RecordingMeta) {
    setBusy(r.sessionId)
    const blob = await assemble(r)
    setBusy(null)
    if (!blob) return
    const ext = r.mime.includes('mp4') || r.mime.includes('aac') ? 'm4a' : r.mime.includes('ogg') ? 'ogg' : 'webm'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${r.title || '會議錄音'}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  async function remove(r: RecordingMeta) {
    await deleteRecording(r.sessionId)
    if (playing?.id === r.sessionId) {
      URL.revokeObjectURL(playing.url)
      setPlaying(null)
    }
    bump()
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="錄音" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-12">
        <button onClick={() => nav('/')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          首頁
        </button>
        <h1 className="mb-4 mt-2 text-xl font-extrabold text-ink">錄音管理</h1>
        <SettingsTabs />

        <section className="mb-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13.5px] font-extrabold text-ink">已用空間</span>
            <span className="tnum text-[13px] font-bold text-brand-ink">{formatBytes(totalBytes)}</span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-faint">
            {recs.length} 份錄音
            {info?.quota ? ` · 裝置配額 ${formatBytes(info.quota)}` : ''}
            {info ? ` · 常駐儲存${info.persisted ? '已授權' : '未授權'}` : ''}
          </p>
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1.5 text-[12px] font-bold text-muted">音檔保留期限（逐字稿與紀錄永久保留）</div>
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
              {RETENTION.map((o) => {
                const active = o.v === s.audioRetentionDays
                return (
                  <button
                    key={o.v}
                    onClick={async () => {
                      set({ audioRetentionDays: o.v })
                      await pruneOlderThan(o.v)
                      bump()
                    }}
                    className="flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-bold transition-colors"
                    style={active ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--muted)' }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
          <button onClick={() => nav('/settings/diagnostics')} className="mt-3 w-full text-center text-[12px] font-semibold text-brand-ink">
            查看裝置診斷 →
          </button>
        </section>

        {recs.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <span className="material-symbols-rounded text-faint" style={{ fontSize: 40 }}>
              mic
            </span>
            <div className="mt-2 text-[13px] font-bold text-ink">還沒有錄音</div>
            <p className="mt-1 text-[12px] text-faint">在首頁開啟「錄音存檔」後開始會議，音檔會存在這台裝置。</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {recs.map((r) => (
              <div key={r.sessionId} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-surface-2 text-brand-ink">
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                      mic
                    </span>
                  </span>
                  <button onClick={() => nav(`/minutes/${r.sessionId}`)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13.5px] font-bold text-ink">{r.title || '（未命名）'}</span>
                    <span className="tnum block text-[11.5px] text-faint">
                      {shortDate(r.createdAt)} · {formatBytes(r.bytes)} · {r.segments} 段
                    </span>
                  </button>
                </div>
                <div className="mt-2 flex gap-1.5 border-t border-line pt-2">
                  <button
                    onClick={() => play(r)}
                    disabled={busy === r.sessionId}
                    className="flex-1 rounded-lg bg-surface-2 py-1.5 text-[12px] font-bold text-brand-ink disabled:opacity-60"
                  >
                    {busy === r.sessionId ? '載入中…' : '播放'}
                  </button>
                  <button onClick={() => exportFile(r)} className="flex-1 rounded-lg bg-surface-2 py-1.5 text-[12px] font-bold text-ink">
                    匯出
                  </button>
                  <button
                    onClick={() => remove(r)}
                    className="flex-1 rounded-lg py-1.5 text-[12px] font-bold"
                    style={{ background: 'var(--live-tint)', color: 'var(--live)' }}
                  >
                    刪除
                  </button>
                </div>
                {playing?.id === r.sessionId && (
                  <audio src={playing.url} controls autoPlay className="mt-2 w-full" style={{ height: 36 }} />
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-[11px] leading-relaxed text-faint">
          音檔只存在這台裝置。清除瀏覽器資料會一併刪除——重要錄音請用「匯出」另存。
        </p>
      </main>
    </div>
  )
}
