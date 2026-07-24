import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { engine } from '../lib/engine'
import { LANG_LIST, LANGS, targetLabel } from '../lib/langs'
import { listSessions } from '../lib/history'
import type { LangCode, TargetLang } from '../lib/types'
import { TopBar } from '../components/TopBar'
import { Toggle } from '../components/Toggle'
import { Select } from '../components/Select'
import { Mic, Calendar, ArrowRight } from '../components/icons'
import { shortDate, durationLabel } from '../lib/format'

export default function Home() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const nav = useNavigate()
  const [starting, setStarting] = useState(false)
  const sessions = useMemo(() => listSessions(), [])

  async function start() {
    setStarting(true)
    await engine.start()
    nav('/live')
  }

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
            <Select value={settings.sourceLang} onChange={(v) => setSettings({ sourceLang: v as LangCode })} ariaLabel="來源語言">
              {LANG_LIST.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
            <ArrowRight className="h-4 w-4 flex-none text-faint" />
            <Select value={settings.targetLang} onChange={(v) => setSettings({ targetLang: v as TargetLang })} ariaLabel="字幕語言">
              <option value="none">不翻譯（純逐字稿）</option>
              {LANG_LIST.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            {settings.targetLang === 'none'
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
              {sessions.slice(0, 6).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => nav(`/minutes/${s.id}`)}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left"
                >
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-surface-2 text-brand-ink">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink">{s.title}</span>
                    <span className="tnum block text-[11.5px] text-faint">
                      {shortDate(s.createdAt)} · {durationLabel(s.durationSec)}
                      {s.speakers ? ` · ${s.speakers} 位發言者` : ''}
                    </span>
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold"
                    style={{
                      color: s.hasMinutes ? 'var(--ok)' : 'var(--muted)',
                      background: s.hasMinutes ? 'var(--ok-tint)' : 'var(--surface-2)',
                    }}
                  >
                    {s.hasMinutes ? '已整理' : '未生成紀錄'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
