import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { SettingsTabs } from '../components/SettingsTabs'
import { ChevronLeft } from '../components/icons'
import { listArchived, updateSessionMeta, deleteSession, exportOne, importBackup } from '../lib/history'
import { shortDate, durationLabel } from '../lib/format'
import type { SessionMeta } from '../lib/types'

export default function Archived() {
  const nav = useNavigate()
  const [rev, setRev] = useState(0)
  const [query, setQuery] = useState('')
  const [deleted, setDeleted] = useState<{ blob: { id: string; payload: string; updatedAt: number }; title: string } | null>(null)
  const undoTimer = useRef<number | null>(null)
  const bump = () => setRev((x) => x + 1)
  const all = useMemo(() => listArchived(), [rev])
  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? all.filter((a) => a.title.toLowerCase().includes(q)) : all
  }, [all, query])

  function restore(a: SessionMeta) {
    updateSessionMeta(a.id, { archived: false })
    bump()
  }
  function remove(a: SessionMeta) {
    const blob = exportOne(a.id)
    deleteSession(a.id)
    bump()
    if (blob) {
      setDeleted({ blob, title: a.title })
      if (undoTimer.current) window.clearTimeout(undoTimer.current)
      undoTimer.current = window.setTimeout(() => setDeleted(null), 5000)
    }
  }
  function undo() {
    if (!deleted) return
    importBackup([deleted.blob])
    setDeleted(null)
    bump()
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
  }
  function restoreAll() {
    all.forEach((a) => updateSessionMeta(a.id, { archived: false }))
    bump()
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="封存" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-12">
        <button onClick={() => nav('/')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          首頁
        </button>
        <h1 className="mb-4 mt-2 text-xl font-extrabold text-ink">封存的會議</h1>
        <SettingsTabs />

        {all.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <span className="material-symbols-rounded text-faint" style={{ fontSize: 40 }}>
              archive
            </span>
            <div className="mt-2 text-[13px] font-bold text-ink">目前沒有封存的會議</div>
            <p className="mt-1 text-[12px] text-faint">在首頁向左滑動會議即可「封存」，封存後不會顯示在首頁。</p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋封存的會議…"
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint"
              />
              <button onClick={restoreAll} className="flex-none rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-bold text-brand-ink">
                全部復原
              </button>
            </div>
            <div className="mb-2 px-1 text-[11px] text-faint">共 {items.length} 場</div>
            <div className="grid gap-2">
              {items.length === 0 && (
                <div className="rounded-xl border border-line bg-surface p-4 text-center text-[12.5px] text-faint">找不到符合的會議</div>
              )}
              {items.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-3">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-surface-2 text-muted">
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                      archive
                    </span>
                  </span>
                  <button onClick={() => nav(`/minutes/${a.id}`)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13.5px] font-bold text-ink">{a.title}</span>
                    <span className="tnum block text-[11.5px] text-faint">
                      {shortDate(a.createdAt)} · {durationLabel(a.durationSec)}
                      {a.hasMinutes ? ' · 已整理' : ''}
                    </span>
                  </button>
                  <button
                    onClick={() => restore(a)}
                    aria-label="復原"
                    className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-2 text-brand-ink"
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: 19 }}>
                      unarchive
                    </span>
                  </button>
                  <button
                    onClick={() => remove(a)}
                    aria-label="永久刪除"
                    className="grid h-9 w-9 flex-none place-items-center rounded-lg"
                    style={{ background: 'var(--live-tint)', color: 'var(--live)' }}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: 19 }}>
                      delete
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {deleted && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg">
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">已刪除「{deleted.title}」</span>
          <button onClick={undo} className="flex-none rounded-lg bg-brand px-3 py-1.5 text-[12px] font-extrabold text-white">
            復原
          </button>
        </div>
      )}
    </div>
  )
}
