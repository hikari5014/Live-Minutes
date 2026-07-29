import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { TopBar } from '../components/TopBar'
import { SettingsTabs } from '../components/SettingsTabs'
import { ChevronLeft } from '../components/icons'
import { fetchUsage, pushBackup, pullBackup, type UsageInfo } from '../lib/api'
import { CHUNK_OPTIONS, WAIT_OPTIONS, sourcePx, translationPx } from '../lib/display'
import { getBackupKey, ensureBackupKey, setBackupKey, exportAll, importBackup } from '../lib/history'
import { downloadText } from '../lib/minutes'
import type { CaptionOrder } from '../lib/types'

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
        <SettingsTabs />

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
            title="逐字稿分段"
            desc="把連續幾句合併成一段再定稿。中文辨識常吐很短的片段，調成「中／長」可讓逐字稿從碎句變成通順段落；有翻譯時同時讓譯文更完整、更省 DeepL 額度，代價是延遲略增。"
          >
            <div className="grid gap-3">
              <div>
                <div className="mb-1.5 text-[12px] font-bold text-muted">一次成段長度</div>
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

          <Section
            title="麥克風回音消除"
            desc="一般情況請保持開啟。若你是用「喇叭外放線上會議、再用麥克風收音」，回音消除會把那個聲音當成回音消掉——這時請關閉。（桌機建議改用「分頁音訊」，音質更好。）"
          >
            <Segmented
              value={s.echoCancel ? 1 : 0}
              options={[
                { v: 1, label: '開啟（一般會議）' },
                { v: 0, label: '關閉（外放收音）' },
              ]}
              onChange={(v) => set({ echoCancel: v === 1 })}
            />
          </Section>

          <Section
            title="與會者與術語表"
            desc="提供給 AI 作為聽寫依據：人名用於判斷「誰說了什麼」與待辦歸屬；術語表用於修正產品／專案等專有名詞的寫法。以逗號分隔。"
          >
            <div className="grid gap-2">
              <input
                value={s.participants}
                onChange={(e) => set({ participants: e.target.value })}
                placeholder="與會者，例：Mark、小美、John"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-faint"
              />
              <input
                value={s.glossary}
                onChange={(e) => set({ glossary: e.target.value })}
                placeholder="術語，例：Live Minutes、Sprint 24、Cloudflare"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-faint"
              />
            </div>
          </Section>

          <Section title="雲端備份" desc="用一組「備份碼」把你的會議存到雲端（不需帳號）；換裝置或清除瀏覽器資料後可用備份碼還原。">
            <BackupSection />
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

        <button onClick={() => nav('/about')} className="mt-5 block w-full text-center text-[12px] font-semibold text-brand-ink">
          關於與資料 · 隱私說明
        </button>
        <p className="mt-3 text-center text-[11px] text-faint">Live Minutes · v{__APP_VERSION__}</p>
      </main>
    </div>
  )
}

function BackupSection() {
  const [key, setKey] = useState<string | null>(() => getBackupKey())
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [restoreKey, setRestoreKey] = useState('')
  const [copied, setCopied] = useState(false)

  async function backupNow() {
    setBusy(true)
    setStatus(null)
    const k = ensureBackupKey()
    setKey(k)
    const items = exportAll()
    const ok = await pushBackup(k, items)
    setStatus(ok ? `已備份 ${items.length} 場會議到雲端。` : '備份失敗：需連上後端服務。')
    setBusy(false)
  }
  async function restore() {
    const k = restoreKey.trim()
    if (k.length < 16) {
      setStatus('備份碼格式不正確。')
      return
    }
    setBusy(true)
    setStatus(null)
    const items = await pullBackup(k)
    if (!items) {
      setStatus('還原失敗：查無資料或無法連線。')
      setBusy(false)
      return
    }
    const n = importBackup(items)
    setBackupKey(k)
    setKey(k)
    setStatus(`已還原 ${n} 場會議，回首頁即可看到。`)
    setBusy(false)
  }
  function copyKey() {
    if (!key) return
    navigator.clipboard
      ?.writeText(key)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => undefined)
  }
  function exportFile() {
    downloadText('live-minutes-backup.json', JSON.stringify(exportAll()))
  }
  function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const items = JSON.parse(String(reader.result)) as { id: string; payload: string }[]
        setStatus(`已從檔案匯入 ${importBackup(items)} 場會議。`)
      } catch {
        setStatus('匯入失敗：檔案格式不正確。')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="grid gap-3">
      {key ? (
        <div className="rounded-xl border border-line p-3">
          <div className="text-[11px] font-bold text-faint">你的備份碼（請妥善保存，換裝置用它還原）</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink">{key}</code>
            <button onClick={copyKey} className="flex-none rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-brand-ink">
              {copied ? '已複製' : '複製'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-faint">尚未啟用。啟用後會產生一組隨機備份碼，把你的會議存到雲端。</p>
      )}
      <button onClick={backupNow} disabled={busy} className="w-full rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white disabled:opacity-60">
        {busy ? '處理中…' : key ? '立即備份到雲端' : '啟用並備份到雲端'}
      </button>
      <div className="rounded-xl border border-line p-3">
        <div className="mb-1.5 text-[12px] font-bold text-muted">用備份碼還原</div>
        <div className="flex gap-2">
          <input
            value={restoreKey}
            onChange={(e) => setRestoreKey(e.target.value)}
            placeholder="貼上備份碼"
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-2 font-mono text-[12px] text-ink placeholder:text-faint"
          />
          <button onClick={restore} disabled={busy} className="flex-none rounded-lg border border-line px-3 text-[12px] font-bold text-ink disabled:opacity-60">
            還原
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={exportFile} className="flex-1 rounded-lg border border-line py-2 text-[12px] font-bold text-ink">
          匯出檔案
        </button>
        <label className="flex-1 cursor-pointer rounded-lg border border-line py-2 text-center text-[12px] font-bold text-ink">
          匯入檔案
          <input type="file" accept="application/json,.json" onChange={importFile} className="hidden" />
        </label>
      </div>
      {status && <div className="text-[12px] text-brand-ink">{status}</div>}
      <p className="text-[10.5px] leading-relaxed text-faint">⚠️ 備份碼等同存取權，請勿外流；備份以明文存放於你的 Cloudflare D1。</p>
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
