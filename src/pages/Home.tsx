import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { engine } from '../lib/engine'
import { LANG_LIST, LANGS, targetLabel } from '../lib/langs'
import { listSessions, listFolders, updateSessionMeta, deleteSession, createFolder } from '../lib/history'
import type { Folder, LangCode, SessionMeta, TargetLang } from '../lib/types'
import { TopBar } from '../components/TopBar'
import { Toggle } from '../components/Toggle'
import { Select } from '../components/Select'
import { SwipeRow } from '../components/SwipeRow'
import { Mic, Calendar, ArrowRight } from '../components/icons'
import { shortDate, durationLabel } from '../lib/format'

export default function Home() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const nav = useNavigate()
  const [starting, setStarting] = useState(false)
  const [sessions, setSessions] = useState<SessionMeta[]>(() => listSessions())
  const [folders, setFolders] = useState<Folder[]>(() => listFolders())
  const [moving, setMoving] = useState<SessionMeta | null>(null)
  const [blockMsg, setBlockMsg] = useState<string | null>(null)

  function reload() {
    setSessions(listSessions())
    setFolders(listFolders())
  }

  async function start() {
    if (settings.autoDetect) {
      setStarting(true)
      const ready = await engine.deepgramReady()
      if (!ready) {
        setStarting(false)
        setBlockMsg(
          '「多語言自動偵測」需要啟用付費 Deepgram（設定 DEEPGRAM_API_KEY 且能簽發 token）。目前偵測不到可用的 Deepgram，無法開始會議。\n\n請改用一般語言模式，或啟用 Deepgram 後再試。',
        )
        return
      }
    }
    setStarting(true)
    const ok = await engine.start()
    if (ok) nav('/live')
    else setStarting(false)
  }

  const folderName = (id?: string | null) => (id ? folders.find((f) => f.id === id)?.name : undefined)

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar />
      <main className="safe-b mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-10">
        <section className="pt-4">
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">開始一場會議</h1>
          <p className="mt-1 text-[15px] text-muted">即時雙語字幕 · 分享連結 · AI 會議紀錄</p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <input
            value={settings.title}
            onChange={(e) => setSettings({ title: e.target.value })}
            placeholder="會議標題（可留空）"
            className="mb-3 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-faint"
          />
          <div className="flex items-center gap-2">
            <Select
              value={settings.autoDetect ? 'auto' : settings.sourceLang}
              onChange={(v) => (v === 'auto' ? setSettings({ autoDetect: true }) : setSettings({ autoDetect: false, sourceLang: v as LangCode }))}
              ariaLabel="來源語言"
            >
              <option value="auto">🌐 自動偵測（多語言）</option>
              {LANG_LIST.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
            <ArrowRight className="h-4 w-4 flex-none text-faint" />
            {settings.autoDetect ? (
              <div className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-bold text-ink">中文（自動翻譯）</div>
            ) : (
              <Select value={settings.targetLang} onChange={(v) => setSettings({ targetLang: v as TargetLang })} ariaLabel="字幕語言">
                <option value="none">不翻譯（純逐字稿）</option>
                {LANG_LIST.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: settings.autoDetect ? 'var(--warn)' : 'var(--faint)' }}>
            {settings.autoDetect
              ? '⚠️ 自動判斷每個人說的語言並翻成中文（中文不翻譯）。需啟用付費 Deepgram，否則無法開始會議。'
              : settings.targetLang === 'none'
                ? '純逐字稿模式，不呼叫翻譯、省 DeepL 額度。'
                : `${LANGS[settings.sourceLang].label} → ${targetLabel(settings.targetLang)}，只翻定稿句。`}
          </p>

          <div className="mt-4 grid gap-3 border-t border-line pt-4">
            <Toggle checked={settings.diarization} onChange={(v) => setSettings({ diarization: v })} label="語者分離" hint="標記發言者 1／2／3（需 Deepgram）" />
            <Toggle checked={settings.generateMinutes} onChange={(v) => setSettings({ generateMinutes: v })} label="會後 AI 紀錄" hint="關閉可省 Gemini 額度" />
          </div>
        </section>

        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="mx-auto mt-2 grid h-32 w-32 place-items-center rounded-full text-white shadow-lg disabled:opacity-70"
          style={{
            background: 'radial-gradient(120% 120% at 40% 30%, var(--live) 0%, #a51f26 100%)',
            boxShadow: '0 12px 30px color-mix(in srgb, var(--live) 45%, transparent)',
          }}
        >
          <span className="grid place-items-center gap-1">
            <Mic className="h-7 w-7" />
            <span className="text-[13px] font-extrabold tracking-wide">{starting ? '啟動中…' : '開始錄音'}</span>
          </span>
        </button>
        <p className="text-center text-xs text-faint">點按開始 · 請保持螢幕開啟以免中斷</p>

        {sessions.length > 0 && (
          <section className="mt-2">
            <div className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wider text-faint">最近的會議</div>
            <div className="grid gap-2">
              {sessions.map((s) => (
                <SwipeRow
                  key={s.id}
                  onTap={() => nav(`/minutes/${s.id}`)}
                  left={[
                    {
                      icon: 'push_pin',
                      label: s.pinned ? '取消釘選' : '釘選',
                      color: 'var(--zh)',
                      onAction: () => {
                        updateSessionMeta(s.id, { pinned: !s.pinned })
                        reload()
                      },
                    },
                    { icon: 'drive_file_move', label: '移動', color: 'var(--brand)', onAction: () => setMoving(s) },
                  ]}
                  right={[
                    {
                      icon: 'archive',
                      label: '封存',
                      color: 'var(--muted)',
                      onAction: () => {
                        updateSessionMeta(s.id, { archived: true })
                        reload()
                      },
                    },
                    {
                      icon: 'delete',
                      label: '刪除',
                      color: 'var(--live)',
                      onAction: () => {
                        deleteSession(s.id)
                        reload()
                      },
                    },
                  ]}
                >
                  <div className="flex items-center gap-3 bg-surface p-3">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-surface-2 text-brand-ink">
                      <Calendar className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {s.pinned && (
                          <span className="material-symbols-rounded flex-none text-zh-ink" style={{ fontSize: 15 }}>
                            push_pin
                          </span>
                        )}
                        <span className="truncate text-[13.5px] font-bold text-ink">{s.title}</span>
                      </span>
                      <span className="tnum mt-0.5 block text-[11.5px] text-faint">
                        {shortDate(s.createdAt)} · {durationLabel(s.durationSec)}
                        {s.speakers ? ` · ${s.speakers} 位發言者` : ''}
                      </span>
                      {folderName(s.folderId) && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted">
                          <span className="material-symbols-rounded" style={{ fontSize: 12 }}>
                            folder
                          </span>
                          {folderName(s.folderId)}
                        </span>
                      )}
                    </span>
                    <span
                      className="flex-none rounded-full px-2 py-0.5 text-[10.5px] font-extrabold"
                      style={{
                        color: s.hasMinutes ? 'var(--ok)' : 'var(--muted)',
                        background: s.hasMinutes ? 'var(--ok-tint)' : 'var(--surface-2)',
                      }}
                    >
                      {s.hasMinutes ? '已整理' : '未生成'}
                    </span>
                  </div>
                </SwipeRow>
              ))}
            </div>
            <p className="mt-2 px-1 text-[10.5px] text-faint">← 左滑：封存／刪除　·　右滑：釘選／移動 →</p>
          </section>
        )}
      </main>

      {moving && (
        <FolderPicker
          session={moving}
          folders={folders}
          onClose={() => setMoving(null)}
          onChanged={reload}
        />
      )}

      {blockMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setBlockMsg(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-extrabold text-ink">⚠️ 無法開始會議</div>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-body">{blockMsg}</p>
            <button onClick={() => setBlockMsg(null)} className="mt-4 w-full rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white">
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FolderPicker({
  session,
  folders,
  onClose,
  onChanged,
}: {
  session: SessionMeta
  folders: Folder[]
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  function assign(folderId: string | null) {
    updateSessionMeta(session.id, { folderId })
    onChanged()
    onClose()
  }
  function addAndAssign() {
    const n = name.trim()
    if (!n) return
    const f = createFolder(n)
    updateSessionMeta(session.id, { folderId: f.id })
    onChanged()
    onClose()
  }
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="safe-b w-full max-w-md rounded-t-2xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-sm font-extrabold text-ink">移動「{session.title}」到資料夾</div>
        <div className="grid max-h-[44vh] gap-1.5 overflow-y-auto">
          <button onClick={() => assign(null)} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-[13px] font-bold text-ink">
            <span className="material-symbols-rounded text-muted" style={{ fontSize: 18 }}>folder_off</span>
            不分類（移出資料夾）
            {!session.folderId && <span className="ml-auto font-extrabold text-brand-ink">✓</span>}
          </button>
          {folders.map((f) => (
            <button key={f.id} onClick={() => assign(f.id)} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-[13px] font-bold text-ink">
              <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 18 }}>folder</span>
              {f.name}
              {session.folderId === f.id && <span className="ml-auto font-extrabold text-brand-ink">✓</span>}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新資料夾名稱"
            className="flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-faint"
          />
          <button onClick={addAndAssign} className="rounded-xl bg-brand px-4 text-[13px] font-extrabold text-white">
            新增
          </button>
        </div>
        <button onClick={onClose} className="mt-3 w-full rounded-xl border border-line py-2.5 text-[13px] font-bold text-muted">
          取消
        </button>
      </div>
    </div>
  )
}
