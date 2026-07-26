import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { SettingsTabs } from '../components/SettingsTabs'
import { ChevronLeft } from '../components/icons'
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  sessionsInFolder,
  listSessions,
  updateSessionMeta,
} from '../lib/history'
import { shortDate, durationLabel } from '../lib/format'
import type { Folder, SessionMeta } from '../lib/types'

const UNFILED = '__unfiled__'

export default function Folders() {
  const nav = useNavigate()
  const [rev, setRev] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null) // null = root
  const [newName, setNewName] = useState('')
  const [moving, setMoving] = useState<SessionMeta | null>(null)
  const [renaming, setRenaming] = useState<Folder | null>(null)
  const [renameText, setRenameText] = useState('')
  const [confirmDel, setConfirmDel] = useState<Folder | null>(null)
  const bump = () => setRev((x) => x + 1)

  const folders = useMemo(() => listFolders(), [rev])
  const unfiled = useMemo(() => listSessions().filter((s) => !s.folderId), [rev])
  const current = openId && openId !== UNFILED ? folders.find((f) => f.id === openId) ?? null : null
  const items = useMemo(() => {
    if (openId === UNFILED) return unfiled
    return current ? sessionsInFolder(current.id) : []
  }, [openId, current, unfiled, rev])

  function addFolder() {
    const n = newName.trim()
    if (!n) return
    createFolder(n)
    setNewName('')
    bump()
  }
  function assign(s: SessionMeta, folderId: string | null) {
    updateSessionMeta(s.id, { folderId })
    setMoving(null)
    bump()
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="資料夾" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-12">
        <button onClick={() => nav('/')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          首頁
        </button>
        <h1 className="mb-4 mt-2 text-xl font-extrabold text-ink">分類資料夾</h1>
        <SettingsTabs />

        {/* Breadcrumb — Drive-style path back to the root list */}
        <div className="mb-3 flex items-center gap-1 text-[12.5px]">
          <button onClick={() => setOpenId(null)} className={openId ? 'font-bold text-brand-ink' : 'font-bold text-ink'}>
            我的資料夾
          </button>
          {openId && (
            <>
              <span className="text-faint">›</span>
              <span className="truncate font-bold text-ink">{openId === UNFILED ? '未分類' : current?.name ?? '（已刪除）'}</span>
            </>
          )}
        </div>

        {!openId ? (
          <>
            <div className="mb-3 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addFolder()}
                placeholder="新資料夾名稱"
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint"
              />
              <button onClick={addFolder} className="inline-flex flex-none items-center gap-1 rounded-xl bg-brand px-3 text-[13px] font-extrabold text-white">
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                  create_new_folder
                </span>
                新增
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {folders.map((f) => {
                const n = sessionsInFolder(f.id).length
                return (
                  <div key={f.id} className="rounded-xl border border-line bg-surface p-3">
                    <button onClick={() => setOpenId(f.id)} className="block w-full text-left">
                      <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 30 }}>
                        folder
                      </span>
                      <span className="mt-1 block truncate text-[13px] font-bold text-ink">{f.name}</span>
                      <span className="block text-[11px] text-faint">{n} 場會議</span>
                    </button>
                    <div className="mt-2 flex gap-1.5 border-t border-line pt-2">
                      <button
                        onClick={() => {
                          setRenaming(f)
                          setRenameText(f.name)
                        }}
                        aria-label="重新命名"
                        className="grid h-7 flex-1 place-items-center rounded-lg bg-surface-2 text-muted"
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                          edit
                        </span>
                      </button>
                      <button
                        onClick={() => setConfirmDel(f)}
                        aria-label="刪除資料夾"
                        className="grid h-7 flex-1 place-items-center rounded-lg"
                        style={{ background: 'var(--live-tint)', color: 'var(--live)' }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                          delete
                        </span>
                      </button>
                    </div>
                  </div>
                )
              })}

              <button onClick={() => setOpenId(UNFILED)} className="rounded-xl border border-dashed border-line-strong bg-surface p-3 text-left">
                <span className="material-symbols-rounded text-muted" style={{ fontSize: 30 }}>
                  folder_off
                </span>
                <span className="mt-1 block text-[13px] font-bold text-ink">未分類</span>
                <span className="block text-[11px] text-faint">{unfiled.length} 場會議</span>
              </button>
            </div>

            {folders.length === 0 && (
              <p className="mt-3 text-center text-[12px] text-faint">
                還沒有資料夾。建立後可從「未分類」把會議移入，或在首頁向右滑動會議選「移動」。
              </p>
            )}
          </>
        ) : (
          <>
            {items.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-8 text-center">
                <span className="material-symbols-rounded text-faint" style={{ fontSize: 40 }}>
                  folder_open
                </span>
                <div className="mt-2 text-[13px] font-bold text-ink">這裡沒有會議</div>
                <p className="mt-1 text-[12px] text-faint">
                  {openId === UNFILED ? '所有會議都已分類。' : '從「未分類」或首頁把會議移動到這個資料夾。'}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {items.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-3">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-surface-2 text-brand-ink">
                      <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                        {openId === UNFILED ? 'folder_off' : 'folder'}
                      </span>
                    </span>
                    <button onClick={() => nav(`/minutes/${s.id}`)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[13.5px] font-bold text-ink">{s.title}</span>
                      <span className="tnum block text-[11.5px] text-faint">
                        {shortDate(s.createdAt)} · {durationLabel(s.durationSec)}
                      </span>
                    </button>
                    <button
                      onClick={() => setMoving(s)}
                      aria-label="移動"
                      className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-2 text-brand-ink"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 19 }}>
                        drive_file_move
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Move a meeting to another folder (or out of folders) */}
      {moving && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={() => setMoving(null)}>
          <div className="safe-b w-full max-w-md rounded-t-2xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sm font-extrabold text-ink">移動「{moving.title}」</div>
            <div className="grid max-h-[46vh] gap-1.5 overflow-y-auto">
              <button onClick={() => assign(moving, null)} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-[13px] font-bold text-ink">
                <span className="material-symbols-rounded text-muted" style={{ fontSize: 18 }}>
                  folder_off
                </span>
                未分類
                {!moving.folderId && <span className="ml-auto font-extrabold text-brand-ink">✓</span>}
              </button>
              {folders.map((f) => (
                <button key={f.id} onClick={() => assign(moving, f.id)} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-[13px] font-bold text-ink">
                  <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 18 }}>
                    folder
                  </span>
                  {f.name}
                  {moving.folderId === f.id && <span className="ml-auto font-extrabold text-brand-ink">✓</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setMoving(null)} className="mt-3 w-full rounded-xl border border-line py-2.5 text-[13px] font-bold text-muted">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Rename folder */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setRenaming(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-extrabold text-ink">重新命名資料夾</div>
            <input
              autoFocus
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              className="mt-3 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink"
            />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setRenaming(null)} className="flex-1 rounded-xl border border-line py-2.5 text-[13px] font-bold text-muted">
                取消
              </button>
              <button
                onClick={() => {
                  renameFolder(renaming.id, renameText)
                  setRenaming(null)
                  bump()
                }}
                className="flex-1 rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete folder (meetings are kept, just unfiled) */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-extrabold text-ink">刪除資料夾「{confirmDel.name}」？</div>
            <p className="mt-2 text-[13px] leading-relaxed text-body">裡面的會議<b>不會被刪除</b>，只會變成「未分類」。</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 rounded-xl border border-line py-2.5 text-[13px] font-bold text-muted">
                取消
              </button>
              <button
                onClick={() => {
                  deleteFolder(confirmDel.id)
                  if (openId === confirmDel.id) setOpenId(null)
                  setConfirmDel(null)
                  bump()
                }}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-extrabold text-white"
                style={{ background: 'var(--live)' }}
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
