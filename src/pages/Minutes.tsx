import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSession, getMinutes, saveMinutes } from '../lib/history'
import { requestMinutesFromTranscript, fetchSession } from '../lib/api'
import { transcriptText, minutesMarkdown, downloadText } from '../lib/minutes'
import { TopBar } from '../components/TopBar'
import { ChevronLeft, Sparkles, Download, Users, Calendar } from '../components/icons'
import { shortDate, durationLabel, fromMs } from '../lib/format'
import { speakerColor, speakerLabel, targetLabel } from '../lib/langs'
import type { MinutesDoc, SessionMeta, Utterance } from '../lib/types'

function Block({ title, dot, children }: { title: string; dot: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        {title}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

function Bullet() {
  return <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--brand)' }} />
}

export default function Minutes() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const local = getSession(id)
  const [data, setData] = useState<{ meta: SessionMeta; utterances: Utterance[] } | null>(local)
  const [minutes, setMinutes] = useState<MinutesDoc | null>(() => getMinutes(id))
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!local)

  // No local copy? Fetch it from the backend (viewer on another device).
  useEffect(() => {
    if (data) return
    let ok = true
    fetchSession(id)
      .then((d) => {
        if (!ok || !d) return
        setData({ meta: d.meta, utterances: d.utterances })
        if (d.minutes) setMinutes(d.minutes)
      })
      .finally(() => {
        if (ok) setLoading(false)
      })
    return () => {
      ok = false
    }
  }, [id, data])

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-paper">
        <TopBar />
        <div className="mx-auto max-w-md p-10 text-center text-muted">載入中…</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh flex-col bg-paper">
        <TopBar />
        <div className="mx-auto max-w-md p-8 text-center text-muted">
          找不到這場會議的資料。
          <button onClick={() => nav('/')} className="mx-auto mt-3 block font-bold text-brand-ink">
            回首頁
          </button>
        </div>
      </div>
    )
  }

  const { meta, utterances } = data
  const withTr = meta.targetLang !== 'none'

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const text = transcriptText(utterances, withTr)
      const doc = await requestMinutesFromTranscript(text, meta.title, 'zh-Hant')
      saveMinutes(id, doc)
      setMinutes(doc)
    } catch {
      setError('生成失敗：需要連上後端與 Gemini 金鑰。')
    } finally {
      setGenerating(false)
    }
  }

  function dl() {
    downloadText(`${meta.title || '會議紀錄'}.md`, minutesMarkdown(meta, minutes, utterances))
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-10">
        <button onClick={() => nav('/')} className="no-print mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          首頁
        </button>

        <header className="mt-2">
          <h1 className="text-xl font-extrabold text-ink">{meta.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-faint">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {shortDate(meta.createdAt)}
            </span>
            <span>· {durationLabel(meta.durationSec)}</span>
            {meta.speakers > 0 && (
              <span className="inline-flex items-center gap-1">
                · <Users className="h-3.5 w-3.5" />
                {meta.speakers} 位
              </span>
            )}
            <span>
              · {meta.sourceLang.toUpperCase()} → {targetLabel(meta.targetLang)}
            </span>
          </div>
        </header>

        <section className="mt-5">
          {minutes ? (
            <div className="grid gap-3">
              <div className="rounded-2xl border border-line p-4" style={{ background: 'linear-gradient(130deg,var(--brand-tint),var(--zh-tint))' }}>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-brand-ink">摘要 · AI 生成</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-body">{minutes.summary}</p>
              </div>
              {minutes.decisions.length > 0 && (
                <Block title="決議事項" dot="var(--s3)">
                  <ul className="grid gap-2">
                    {minutes.decisions.map((d, i) => (
                      <li key={i} className="flex gap-2 text-[13.5px] text-body">
                        <Bullet />
                        {d}
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
              {minutes.actionItems.length > 0 && (
                <Block title="待辦事項" dot="var(--live)">
                  <ul className="grid gap-2">
                    {minutes.actionItems.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13.5px] text-body">
                        <span className="mt-0.5 h-4 w-4 flex-none rounded border-[1.5px] border-brand" />
                        <span>
                          {a.text}
                          {a.owner && (
                            <span className="ml-1 rounded-full px-1.5 text-[10.5px] font-extrabold text-zh-ink" style={{ background: 'var(--zh-tint)' }}>
                              {a.owner}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
              {minutes.topics.map((t, i) => (
                <Block key={i} title={t.title} dot="var(--brand)">
                  <ul className="grid gap-1.5">
                    {t.points.map((p, j) => (
                      <li key={j} className="flex gap-2 text-[13.5px] text-body">
                        <Bullet />
                        {p}
                      </li>
                    ))}
                  </ul>
                </Block>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-5 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-brand-ink" />
              <div className="mt-2 text-sm font-bold text-ink">尚未生成 AI 會議紀錄</div>
              <p className="mt-1 text-[12.5px] text-muted">用 Gemini 把逐字稿整理成摘要、決議與待辦。</p>
              <button
                onClick={generate}
                disabled={generating || utterances.length === 0}
                className="no-print mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {generating ? '生成中…' : '生成 AI 紀錄'}
              </button>
              {error && <p className="mt-2 text-[12px] text-live">{error}</p>}
            </div>
          )}
        </section>

        <div className="no-print mt-5 flex gap-2">
          <button onClick={dl} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-[13px] font-bold text-ink">
            <Download className="h-4 w-4" />
            Markdown
          </button>
          <button onClick={() => window.print()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-[13px] font-bold text-ink">
            列印 / PDF
          </button>
        </div>

        <section className="mt-6">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-faint">逐字稿</div>
          <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
            {utterances.length === 0 && <div className="text-center text-sm text-faint">沒有逐字稿內容</div>}
            {utterances.map((u) => (
              <div key={u.id} className="grid gap-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold text-white" style={{ background: speakerColor(u.speaker) }}>
                    {speakerLabel(u.speaker)}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{fromMs(u.ts)}</span>
                </div>
                {withTr ? (
                  <>
                    <div className="text-[12.5px] text-muted">{u.source}</div>
                    {u.translation && <div className="text-[14px] font-medium text-ink">{u.translation}</div>}
                  </>
                ) : (
                  <div className="text-[14px] text-ink">{u.source}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
