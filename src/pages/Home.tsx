import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { engine } from '../lib/engine'
import { fetchUsage } from '../lib/api'
import { tabAudioSupported, tabAudioBlockedReason } from '../lib/audiosource'
import { LANG_LIST, LANGS, targetLabel } from '../lib/langs'
import { listSessions, listFolders, updateSessionMeta, deleteSession, createFolder, saveSession, getDraft, clearDraft, searchSessions, exportOne, importBackup } from '../lib/history'

let quotaChecked = false
import type { Folder, LangCode, SessionMeta, TargetLang } from '../lib/types'
import { TopBar } from '../components/TopBar'
import { Toggle } from '../components/Toggle'
import { Select } from '../components/Select'
import { SwipeRow } from '../components/SwipeRow'
import { Mic, Calendar, ArrowRight } from '../components/icons'
import { shortDate, durationLabel } from '../lib/format'

export function LivePane() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const nav = useNavigate()
  const [starting, setStarting] = useState(false)
  const [sessions, setSessions] = useState<SessionMeta[]>(() => listSessions())
  const [folders, setFolders] = useState<Folder[]>(() => listFolders())
  const [moving, setMoving] = useState<SessionMeta | null>(null)
  const [blockMsg, setBlockMsg] = useState<string | null>(null)
  const [recovered, setRecovered] = useState(false)
  const [query, setQuery] = useState('')
  const [onboard, setOnboard] = useState(() => {
    try {
      return !localStorage.getItem('lm-onboarded')
    } catch {
      return false
    }
  })
  const [deleted, setDeleted] = useState<{ blob: { id: string; payload: string; updatedAt: number }; title: string } | null>(null)
  const [quotaWarn, setQuotaWarn] = useState<string | null>(null)
  const undoTimer = useRef<number | null>(null)

  // One-time quota guardrail: warn if DeepL is nearly exhausted or Deepgram is low.
  useEffect(() => {
    if (quotaChecked) return
    quotaChecked = true
    fetchUsage().then((u) => {
      if (!u) return
      if (u.deepl.configured && u.deepl.limit && (u.deepl.used ?? 0) / u.deepl.limit > 0.9)
        setQuotaWarn('DeepL 翻譯額度即將用盡（已用 >90%）。可改用「不翻譯（純逐字稿）」模式，或補充額度。')
      else if (u.deepgram.configured && u.deepgram.balance != null && u.deepgram.balance < 5)
        setQuotaWarn('Deepgram 餘額偏低，可能影響高品質辨識與多語言偵測。')
    })
  }, [])

  // Recover an in-progress recording that never ended cleanly (crash / closed tab).
  useEffect(() => {
    const d = getDraft()
    if (d && d.utterances.length > 0) {
      saveSession(d.meta, d.utterances)
      clearDraft()
      setSessions(listSessions())
      setRecovered(true)
    } else if (d) {
      clearDraft()
    }
  }, [])

  function reload() {
    setSessions(listSessions())
    setFolders(listFolders())
  }

  function dismissOnboard() {
    try {
      localStorage.setItem('lm-onboarded', '1')
    } catch {
      /* ignore */
    }
    setOnboard(false)
  }

  function removeMeeting(s: SessionMeta) {
    const blob = exportOne(s.id)
    deleteSession(s.id)
    reload()
    if (blob) {
      setDeleted({ blob, title: s.title })
      if (undoTimer.current) window.clearTimeout(undoTimer.current)
      undoTimer.current = window.setTimeout(() => setDeleted(null), 5000)
    }
  }
  function undoDelete() {
    if (!deleted) return
    importBackup([deleted.blob])
    reload()
    setDeleted(null)
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
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
  const shown = useMemo(() => (query.trim() ? searchSessions(query) : sessions), [query, sessions])

  return (
    <>
      <main className="safe-b mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-10">
        {recovered && (
          <div
            className="mt-4 rounded-xl border border-line px-3 py-2 text-[12.5px]"
            style={{ borderLeft: '4px solid var(--warn)', background: 'var(--warn-tint)', color: 'var(--warn)' }}
          >
            已自動救回上次未正常結束的錄音，存到下方「最近的會議」。
          </div>
        )}
        {quotaWarn && (
          <div
            className="mt-4 rounded-xl border border-line px-3 py-2 text-[12.5px]"
            style={{ borderLeft: '4px solid var(--warn)', background: 'var(--warn-tint)', color: 'var(--warn)' }}
          >
            {quotaWarn}
          </div>
        )}
        {onboard && (
          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <div className="text-[13px] font-extrabold text-ink">歡迎使用 Live Minutes 👋</div>
            <ul className="mt-2 grid gap-1 text-[12px] text-muted">
              <li>• 選語言模式：外語→中文、中文→外語、純逐字稿，或多語言自動偵測。</li>
              <li>• 按「開始錄音」需允許麥克風權限，並請保持螢幕開啟。</li>
              <li>• 用「分享連結」讓同事看自己語言的字幕；散會可生成 AI 紀錄。</li>
            </ul>
            <button onClick={dismissOnboard} className="mt-3 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-extrabold text-white">
              開始使用
            </button>
          </div>
        )}
        <section className="pt-4">
          <h1 className="text-[34px] font-extrabold tracking-tight text-ink">即時字幕</h1>
          <p className="mt-1 text-[13.5px] text-muted">即時雙語字幕 · 分享連結 · AI 會議紀錄</p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          {/* One-tap preset for the most common local case: a Chinese-only
              meeting that needs a transcript + minutes, no translation. */}
          <button
            type="button"
            onClick={() =>
              setSettings({
                autoDetect: false,
                sourceLang: 'zh',
                targetLang: 'none',
                diarization: false, // keeps the free, more accurate Chinese engine
                translateChunkChars: 60,
                recordAudio: true,
                generateMinutes: true,
              })
            }
            className="mb-3 flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left"
            style={{ background: 'var(--zh-tint)' }}
          >
            <span className="material-symbols-rounded text-zh-ink" style={{ fontSize: 18 }}>
              graphic_eq
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-extrabold text-zh-ink">純中文會議 · 一鍵設定</span>
              <span className="block text-[10.5px] text-muted">不翻譯 · 分段逐字稿 · 錄音存檔 · 會後 AI 紀錄</span>
            </span>
          </button>
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
            <Toggle
              checked={settings.diarization}
              onChange={(v) => setSettings({ diarization: v })}
              label="語者分離"
              hint={settings.sourceLang === 'zh' && !settings.autoDetect ? '標記發言者，但會改用 Deepgram — 中文準度可能略降' : '標記發言者 1／2／3（需 Deepgram）'}
            />
            <Toggle checked={settings.generateMinutes} onChange={(v) => setSettings({ generateMinutes: v })} label="會後 AI 紀錄" hint="關閉可省 Gemini 額度" />
            <Toggle
              checked={settings.recordAudio}
              onChange={(v) => setSettings({ recordAudio: v })}
              label="錄音存檔"
              hint="音檔只存這台裝置，供會後產生高品質逐字稿"
            />
            {settings.recordAudio && (
              <input
                value={settings.participants}
                onChange={(e) => setSettings({ participants: e.target.value })}
                placeholder="與會者（選填，逗號分隔）例：Mark、小美、John"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-faint"
              />
            )}

            {/* Tab/system audio — desktop Chromium only; elsewhere we say why. */}
            {tabAudioSupported() ? (
              <div>
                <div className="mb-1.5 text-[12px] font-bold text-muted">音訊來源</div>
                <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
                  {(
                    [
                      { v: 'mic', label: '麥克風' },
                      { v: 'tab', label: '分頁音訊' },
                      { v: 'both', label: '兩者' },
                    ] as const
                  ).map((o) => {
                    const active = settings.audioSource === o.v
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setSettings({ audioSource: o.v })}
                        className="flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-bold transition-colors"
                        style={active ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--muted)' }}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
                {settings.audioSource !== 'mic' && (
                  <p className="mt-1.5 text-[11px]" style={{ color: 'var(--warn)' }}>
                    開始後會跳出視窗，請選擇要擷取的<b>分頁</b>並勾選「分享分頁音訊」。適合線上會議／直播。
                    {!settings.diarization && !settings.autoDetect && ' 即時字幕需 Deepgram；未啟用時仍會錄音，可於會後產生逐字稿。'}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-faint">
                <b>音訊來源：麥克風</b>　·　{tabAudioBlockedReason()}
              </p>
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="mx-auto mt-4 grid h-24 w-24 place-items-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-60"
          style={{ background: 'var(--brand)', boxShadow: '0 10px 30px color-mix(in srgb, var(--brand) 40%, transparent)' }}
          aria-label="開始錄音"
        >
          <Mic className="h-9 w-9" />
        </button>
        <p className="text-center text-[13.5px] font-bold text-ink">{starting ? '啟動中…' : '開始錄音'}</p>
        <p className="-mt-2 text-center text-[11.5px] text-faint">請保持螢幕開啟以免中斷</p>

        {/* Recordings that already exist (Zoom/Teams export, voice memo). */}
        <button
          type="button"
          onClick={() => nav('/import')}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-surface py-3.5 text-[13.5px] font-bold text-ink shadow-sm active:scale-[.98]"
        >
          <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 19 }}>
            upload_file
          </span>
          匯入既有錄音檔
        </button>

        {sessions.length > 0 && (
          <section className="mt-2">
            <div className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wider text-faint">最近的會議</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋標題或逐字稿…"
              className="mb-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint"
            />
            <div className="grid gap-2">
              {shown.length === 0 && (
                <div className="rounded-xl border border-line bg-surface p-4 text-center text-[12.5px] text-faint">找不到符合的會議</div>
              )}
              {shown.map((s) => (
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
                    { icon: 'delete', label: '刪除', color: 'var(--live)', onAction: () => removeMeeting(s) },
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

      {deleted && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg">
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">已刪除「{deleted.title}」</span>
          <button onClick={undoDelete} className="flex-none rounded-lg bg-brand px-3 py-1.5 text-[12px] font-extrabold text-white">
            復原
          </button>
        </div>
      )}
    </>
  )
}

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar />
      <LivePane />
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
