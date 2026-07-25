import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { TopBar } from '../components/TopBar'
import { ChevronLeft } from '../components/icons'
import { fetchUsage, type UsageInfo } from '../lib/api'
import { CHUNK_OPTIONS, WAIT_OPTIONS, sourcePx, translationPx } from '../lib/display'
import {
  listArchived,
  listFolders,
  updateSessionMeta,
  deleteSession,
  createFolder,
  renameFolder,
  deleteFolder,
  sessionsInFolder,
} from '../lib/history'
import { shortDate, durationLabel } from '../lib/format'
import type { CaptionOrder, Folder } from '../lib/types'

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-[13.5px] font-extrabold text-ink">{title}</div>
      {desc && <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{desc}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.v === value
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className="flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-bold transition-colors"
            style={active ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--muted)' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function FontSteps({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value
        return (
          <button
            key={n}
            type="button"
            aria-label={`字級 ${n}`}
            onClick={() => onChange(n)}
            className="grid h-9 flex-1 place-items-center rounded-lg border transition-colors"
            style={{
              borderColor: active ? 'var(--brand)' : 'var(--line)',
              background: active ? 'var(--brand-tint)' : 'transparent',
              color: active ? 'var(--brand-ink)' : 'var(--faint)',
              fontSize: 10 + n * 2,
              fontWeight: 800,
            }}
          >
            A
          </button>
        )
      })}
    </div>
  )
}

export default function Settings() {
  const nav = useNavigate()
  const s = useStore((st) => st.settings)
  const set = useStore((st) => st.setSettings)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [usageOpen, setUsageOpen] = useState(false)
  const [usageLoading, setUsageLoading] = useState(false)
  const [rev, setRev] = useState(0)
  const [newFolder, setNewFolder] = useState('')
  const bump = () => setRev((x) => x + 1)
  const archived = useMemo(() => listArchived(), [rev])
  const folders = useMemo(() => listFolders(), [rev])
  const go = (id: string) => nav(`/minutes/${id}`)

  async function loadUsage() {
    setUsageOpen(true)
    setUsageLoading(true)
    setUsage(await fetchUsage())
    setUsageLoading(false)
  }

  const orderOptions: { v: CaptionOrder; label: string }[] = [
    { v: 'newest-top', label: '最新在最上' },
    { v: 'newest-bottom', label: '最新在最下' },
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="設定" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-12">
        <button onClick={() => nav('/')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          首頁
        </button>
        <h1 className="mb-4 mt-2 text-xl font-extrabold text-ink">設定</h1>

        <div className="grid gap-3">
          <Section
            title="字幕捲動方向"
            desc="「最新在最上」＝新句子出現在最上方、往下推擠；「最新在最下」＝新句子在底部、自動往下捲並在下方留白，較好閱讀。"
          >
            <Segmented value={s.captionOrder} options={orderOptions} onChange={(v) => set({ captionOrder: v })} />
          </Section>

          <Section title="字幕字級" desc="分別調整原文與譯文大小（5 級）。右側為即時預覽。">
            <div className="grid gap-4">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-bold text-muted">原文</span>
                  <span className="truncate text-muted" style={{ fontSize: sourcePx(s.fontSource) }}>
                    範例 Sample 123
                  </span>
                </div>
                <FontSteps value={s.fontSource} onChange={(v) => set({ fontSource: v })} />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-bold text-muted">譯文</span>
                  <span className="truncate font-semibold text-ink" style={{ fontSize: translationPx(s.fontTranslation) }}>
                    範例文字
                  </span>
                </div>
                <FontSteps value={s.fontTranslation} onChange={(v) => set({ fontTranslation: v })} />
              </div>
            </div>
          </Section>

          <Section
            title="翻譯分段"
            desc="把連續幾句合併成一段再翻譯：段落越長，譯文越完整、越省 DeepL 額度，但延遲略增。"
          >
            <div className="grid gap-3">
              <div>
                <div className="mb-1.5 text-[12px] font-bold text-muted">一次翻譯長度</div>
                <Segmented value={s.translateChunkChars} options={CHUNK_OPTIONS} onChange={(v) => set({ translateChunkChars: v })} />
              </div>
              {s.translateChunkChars > 0 && (
                <div>
                  <div className="mb-1.5 text-[12px] font-bold text-muted">最長等待（越短越即時）</div>
                  <Segmented value={s.translateMaxWaitSec} options={WAIT_OPTIONS} onChange={(v) => set({ translateMaxWaitSec: v })} />
                </div>
              )}
            </div>
          </Section>

          <Section title="封存的會議" desc="封存的會議不顯示在首頁；可在此復原或永久刪除。">
            {archived.length === 0 ? (
              <div className="text-[12.5px] text-faint">目前沒有封存的會議。</div>
            ) : (
              <div className="grid gap-2">
                {archived.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
                    <button onClick={() => go(a.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[13px] font-bold text-ink">{a.title}</span>
                      <span className="block text-[11px] text-faint">
                        {shortDate(a.createdAt)} · {durationLabel(a.durationSec)}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        updateSessionMeta(a.id, { archived: false })
                        bump()
                      }}
                      aria-label="復原"
                      className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-brand-ink"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                        unarchive
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        deleteSession(a.id)
                        bump()
                      }}
                      aria-label="刪除"
                      className="grid h-8 w-8 place-items-center rounded-lg"
                      style={{ background: 'var(--live-tint)', color: 'var(--live)' }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                        delete
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="分類資料夾" desc="建立資料夾整理會議；刪除資料夾只會取消分類，不會刪除會議。">
            <div className="grid gap-2">
              <div className="flex gap-2">
                <input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="新資料夾名稱"
                  className="flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-faint"
                />
                <button
                  onClick={() => {
                    const n = newFolder.trim()
                    if (!n) return
                    createFolder(n)
                    setNewFolder('')
                    bump()
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 text-[13px] font-extrabold text-white"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                    create_new_folder
                  </span>
                  新增
                </button>
              </div>
              {folders.length === 0 ? (
                <div className="text-[12.5px] text-faint">尚未建立資料夾。在首頁向右滑動會議即可「移動」到資料夾。</div>
              ) : (
                folders.map((f) => <FolderItem key={f.id} folder={f} onChange={bump} go={go} />)
              )}
            </div>
          </Section>

          <Section title="API 使用額度" desc="查詢各服務目前用量（DeepL 字元數、Deepgram 餘額）。">
            {!usageOpen ? (
              <button onClick={loadUsage} className="w-full rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white">
                查看 API 用量
              </button>
            ) : (
              <div className="grid gap-2">
                {usageLoading && <div className="py-2 text-center text-[12.5px] text-faint">查詢中…</div>}
                {!usageLoading && usage && <UsageView usage={usage} />}
                {!usageLoading && !usage && <div className="text-[12.5px] text-live">查詢失敗：需連上後端服務。</div>}
                <div className="mt-1 flex gap-2">
                  <button onClick={loadUsage} className="flex-1 rounded-lg border border-line py-2 text-[12px] font-bold text-ink">
                    重新整理
                  </button>
                  <button onClick={() => setUsageOpen(false)} className="flex-1 rounded-lg border border-line py-2 text-[12px] font-bold text-muted">
                    關閉
                  </button>
                </div>
              </div>
            )}
          </Section>
        </div>

        <p className="mt-5 text-center text-[11px] text-faint">Live Minutes · v{__APP_VERSION__}</p>
      </main>
    </div>
  )
}

function FolderItem({ folder, onChange, go }: { folder: Folder; onChange: () => void; go: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(folder.name)
  const items = sessionsInFolder(folder.id)
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center gap-2 p-2.5">
        <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 20 }}>
          folder
        </span>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              renameFolder(folder.id, name)
              setEditing(false)
              onChange()
            }}
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-[13px] font-bold text-ink"
          />
        ) : (
          <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
            <span className="truncate text-[13px] font-bold text-ink">{folder.name}</span>
            <span className="ml-1.5 text-[11px] text-faint">{items.length}</span>
          </button>
        )}
        <button
          onClick={() => {
            setName(folder.name)
            setEditing(true)
          }}
          aria-label="重新命名"
          className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted"
        >
          <span className="material-symbols-rounded" style={{ fontSize: 17 }}>
            edit
          </span>
        </button>
        <button
          onClick={() => {
            deleteFolder(folder.id)
            onChange()
          }}
          aria-label="刪除資料夾"
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: 'var(--live-tint)', color: 'var(--live)' }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 17 }}>
            delete
          </span>
        </button>
      </div>
      {open &&
        (items.length > 0 ? (
          <div className="grid gap-1 border-t border-line p-2">
            {items.map((it) => (
              <button key={it.id} onClick={() => go(it.id)} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left">
                <span className="truncate text-[12.5px] font-semibold text-ink">{it.title}</span>
                <span className="flex-none text-[10.5px] text-faint">{shortDate(it.createdAt)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="border-t border-line p-2 text-center text-[11.5px] text-faint">此資料夾沒有會議</div>
        ))}
    </div>
  )
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 85 ? 'var(--live)' : 'var(--brand)' }} />
    </div>
  )
}

function UsageRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-[12.5px] font-extrabold text-ink">{name}</div>
      <div className="mt-1 text-[12px] text-muted">{children}</div>
    </div>
  )
}

function UsageView({ usage }: { usage: UsageInfo }) {
  return (
    <div className="grid gap-2">
      <UsageRow name="DeepL · 翻譯">
        {usage.deepl.configured === false ? (
          <span className="text-faint">未設定金鑰</span>
        ) : usage.deepl.error ? (
          <span className="text-live">讀取失敗：{usage.deepl.error}</span>
        ) : (
          <>
            <div>
              已用 {(usage.deepl.used ?? 0).toLocaleString()} / {(usage.deepl.limit ?? 0).toLocaleString()} 字元
            </div>
            <UsageBar used={usage.deepl.used ?? 0} limit={usage.deepl.limit ?? 0} />
          </>
        )}
      </UsageRow>
      <UsageRow name="Deepgram · 辨識">
        {usage.deepgram.configured === false ? (
          <span className="text-faint">未設定金鑰</span>
        ) : usage.deepgram.error ? (
          <span className="text-live">讀取失敗：{usage.deepgram.error}</span>
        ) : usage.deepgram.balance != null ? (
          <div>
            剩餘餘額約 {usage.deepgram.balance.toLocaleString()} {(usage.deepgram.units ?? '').toUpperCase()}
          </div>
        ) : (
          <span className="text-faint">此方案無餘額資訊</span>
        )}
      </UsageRow>
      <UsageRow name="Gemini · 會議紀錄">
        <span className="text-faint">{usage.gemini.note ?? 'Gemini 免費層沒有用量查詢 API。'}</span>
      </UsageRow>
    </div>
  )
}
