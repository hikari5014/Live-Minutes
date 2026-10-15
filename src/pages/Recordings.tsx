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
  type SegmentMeta,
} from '../lib/audiodb'
import { FormatPicker, loadOpts } from '../components/FormatPicker'
import { convert, saveBlob, FORMAT_INFO, estimateBytes, type ConvertOpts } from '../lib/convert'
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
  // Segments are independent files: play them back-to-back rather than gluing
  // their bytes together (which yields a file that stops after segment 1).
  const [playing, setPlaying] = useState<{ id: string; segs: SegmentMeta[]; idx: number; url: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [exportFor, setExportFor] = useState<string | null>(null)
  const [opts, setOpts] = useState<ConvertOpts>(() => loadOpts())
  const [exportProg, setExportProg] = useState<{ id: string; p: number } | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const bump = () => setRev((x) => x + 1)

  useEffect(() => {
    listRecordings().then(setRecs)
    storageInfo().then(setInfo)
  }, [rev])

  // Release any object URL we created for playback/export.
  useEffect(() => () => { if (playing) URL.revokeObjectURL(playing.url) }, [playing])

  const totalBytes = useMemo(() => recs.reduce((n, r) => n + r.bytes, 0), [recs])

  async function loadSeg(r: RecordingMeta, segs: SegmentMeta[], idx: number) {
    const seg = segs[idx]
    const blob = await getSegmentBlob(r.sessionId, seg.seg, seg.mime || r.mime)
    if (!blob) return null
    return URL.createObjectURL(blob)
  }

  async function play(r: RecordingMeta) {
    setBusy(r.sessionId)
    const segs = await listSegments(r.sessionId)
    const url = segs.length ? await loadSeg(r, segs, 0) : null
    setBusy(null)
    if (!url) return
    if (playing) URL.revokeObjectURL(playing.url)
    setPlaying({ id: r.sessionId, segs, idx: 0, url })
  }

  async function playNext(r: RecordingMeta) {
    if (!playing || playing.idx + 1 >= playing.segs.length) return
    const idx = playing.idx + 1
    const url = await loadSeg(r, playing.segs, idx)
    if (!url) return
    URL.revokeObjectURL(playing.url)
    setPlaying({ ...playing, idx, url })
  }

  async function exportFile(r: RecordingMeta) {
    setExportErr(null)
    setExportProg({ id: r.sessionId, p: 0 })
    try {
      const segs = await listSegments(r.sessionId)
      const { blob } = await convert(
        segs.map((seg) => () => getSegmentBlob(r.sessionId, seg.seg, seg.mime || r.mime)),
        opts,
        (p) => setExportProg({ id: r.sessionId, p }),
      )
      saveBlob(blob, `${r.title || '會議錄音'}.${FORMAT_INFO[opts.format].ext}`)
      setExportFor(null)
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e))
    } finally {
      setExportProg(null)
    }
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
          <button
            onClick={() => nav('/import')}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-[12.5px] font-bold text-brand-ink"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 17 }}>
              upload_file
            </span>
            匯入外部音檔
          </button>
          <button
            onClick={() => nav('/convert')}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-[12.5px] font-bold text-brand-ink"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 17 }}>
              sync_alt
            </span>
            音檔轉換工具（任何音檔轉 MP3／M4A／WAV）
          </button>
          <button onClick={() => nav('/settings/diagnostics')} className="mt-2 w-full text-center text-[12px] font-semibold text-brand-ink">
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
                  <button
                    onClick={() => {
                      setExportErr(null)
                      setExportFor(exportFor === r.sessionId ? null : r.sessionId)
                    }}
                    className="flex-1 rounded-lg bg-surface-2 py-1.5 text-[12px] font-bold text-ink"
                  >
                    下載
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
                  <div className="mt-2">
                    <audio key={playing.url} src={playing.url} controls autoPlay onEnded={() => playNext(r)} className="w-full" style={{ height: 36 }} />
                    {playing.segs.length > 1 && (
                      <p className="mt-1 text-[11px] text-faint">
                        第 {playing.idx + 1} / {playing.segs.length} 段 · 播完自動接下一段
                      </p>
                    )}
                  </div>
                )}
                {exportFor === r.sessionId && (
                  <div className="mt-2 rounded-xl bg-surface-2 p-3">
                    <FormatPicker value={opts} onChange={setOpts} />
                    <p className="mt-2 text-[11.5px] text-faint">預估大小約 {formatBytes(estimateBytes(r.durationMs / 1000, opts))}</p>
                    {exportProg?.id === r.sessionId ? (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(exportProg.p * 100)}%`, background: 'var(--brand)' }} />
                        </div>
                        <p className="mt-1 text-[11.5px] text-muted">轉檔中 {Math.round(exportProg.p * 100)}%…</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => exportFile(r)}
                        disabled={!!exportProg}
                        className="mt-2 w-full rounded-full py-2.5 text-[13px] font-extrabold text-white disabled:opacity-50"
                        style={{ background: 'var(--brand)' }}
                      >
                        轉成 {FORMAT_INFO[opts.format].label} 並下載
                      </button>
                    )}
                    {exportErr && <p className="mt-1.5 text-[12px] text-live">{exportErr}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-[11px] leading-relaxed text-faint">
          音檔只存在這台裝置。清除瀏覽器資料會一併刪除——重要錄音請用「下載」另存。
        </p>
      </main>
    </div>
  )
}
