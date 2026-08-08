import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { SettingsTabs } from '../components/SettingsTabs'
import { ChevronLeft } from '../components/icons'
import { getLlmConfig, setLlmConfig, llmTest, DEFAULT_LLM, type LlmConfig, type LlmProvider } from '../lib/llm'

const PROVIDERS: { v: LlmProvider; name: string; desc: string }[] = [
  { v: 'builtin', name: '內建（伺服器 Gemini）', desc: '預設。金鑰在伺服器端，開箱即用，支援大檔匯入。' },
  { v: 'gemini', name: 'Gemini · 個人金鑰', desc: '用你自己的 Google AI 金鑰，額度算你的；瀏覽器直連 Google。' },
  { v: 'openai', name: 'OpenAI 相容 API', desc: 'OpenAI／Groq／OpenRouter／本機 Ollama 等，自訂端點與模型。' },
]

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  secret?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-muted">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-[12.5px] text-ink placeholder:text-faint"
      />
    </label>
  )
}

export default function AISettings() {
  const nav = useNavigate()
  const [cfg, setCfg] = useState<LlmConfig>(() => getLlmConfig())
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function save(patch: Partial<LlmConfig>) {
    setResult(null)
    setCfg(setLlmConfig(patch))
  }

  async function test() {
    setTesting(true)
    setResult(null)
    setResult(await llmTest(cfg))
    setTesting(false)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="AI 模型" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-12">
        <button onClick={() => nav('/')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          首頁
        </button>
        <h1 className="mb-4 mt-2 text-xl font-extrabold text-ink">AI 模型</h1>
        <SettingsTabs />

        <div className="grid gap-2">
          {PROVIDERS.map((p) => {
            const active = cfg.provider === p.v
            return (
              <button
                key={p.v}
                type="button"
                onClick={() => save({ provider: p.v })}
                className="rounded-2xl border p-4 text-left transition-colors"
                style={{
                  borderColor: active ? 'var(--brand)' : 'var(--line)',
                  background: active ? 'var(--brand-tint)' : 'var(--surface)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-4 w-4 flex-none place-items-center rounded-full border-2"
                    style={{ borderColor: active ? 'var(--brand)' : 'var(--border-strong)' }}
                  >
                    {active && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--brand)' }} />}
                  </span>
                  <span className="text-[13.5px] font-extrabold text-ink">{p.name}</span>
                </div>
                <p className="mt-1 pl-6 text-[12px] leading-relaxed text-muted">{p.desc}</p>
              </button>
            )
          })}
        </div>

        {cfg.provider === 'gemini' && (
          <section className="mt-3 grid gap-3 rounded-2xl border border-line bg-surface p-4">
            <Field label="Gemini API 金鑰" value={cfg.geminiKey} onChange={(v) => save({ geminiKey: v })} placeholder="AIza…（https://aistudio.google.com/apikey 免費申請）" secret />
            <Field label="模型" value={cfg.geminiModel} onChange={(v) => save({ geminiModel: v })} placeholder={DEFAULT_LLM.geminiModel} />
            <p className="text-[11px] leading-relaxed text-faint">
              支援音檔逐字稿（含分講者）與會議紀錄。單段音訊上限約 14MB——本 App 的錄音每 10 分鐘一段（約 3–4MB），沒有問題；超大檔匯入請用內建服務。
            </p>
          </section>
        )}

        {cfg.provider === 'openai' && (
          <section className="mt-3 grid gap-3 rounded-2xl border border-line bg-surface p-4">
            <Field label="API 端點（Base URL）" value={cfg.oaiBase} onChange={(v) => save({ oaiBase: v })} placeholder="https://api.openai.com/v1" />
            <Field label="API 金鑰" value={cfg.oaiKey} onChange={(v) => save({ oaiKey: v })} placeholder="sk-…（本機 Ollama 可留空）" secret />
            <Field label="文字模型（會議紀錄）" value={cfg.oaiTextModel} onChange={(v) => save({ oaiTextModel: v })} placeholder="gpt-4o-mini / llama-3.3-70b …" />
            <Field label="語音轉文字模型" value={cfg.oaiAudioModel} onChange={(v) => save({ oaiAudioModel: v })} placeholder="whisper-1 / whisper-large-v3 …" />
            <p className="text-[11px] leading-relaxed text-faint">
              端點範例：OpenAI <code>https://api.openai.com/v1</code>、Groq <code>https://api.groq.com/openai/v1</code>、OpenRouter
              <code> https://openrouter.ai/api/v1</code>、本機 Ollama <code>http://localhost:11434/v1</code>（需設 OLLAMA_ORIGINS 允許本站）。
              <br />⚠️ Whisper 系語音模型<b>沒有語者分離</b>，逐字稿不會分講者；要分講者請用 Gemini 系。
            </p>
          </section>
        )}

        <button
          onClick={test}
          disabled={testing}
          className="mt-3 w-full rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white disabled:opacity-60"
        >
          {testing ? '測試中…' : '測試連線'}
        </button>
        {result && (
          <p className="mt-2 rounded-xl border border-line px-3 py-2 text-[12.5px]" style={result.ok ? { background: 'var(--ok-tint)', color: 'var(--ok)' } : { background: 'var(--live-tint)', color: 'var(--live)' }}>
            {result.message}
          </p>
        )}

        <div className="mt-5 grid gap-2 text-[11px] leading-relaxed text-faint">
          <p>
            <b className="text-muted">套用範圍：</b>純錄音模式的會後處理、「產生權威版逐字稿」、AI 會議紀錄生成。
            大檔匯入（/import）與即時翻譯字幕仍使用內建服務。
          </p>
          <p>
            <b className="text-muted">安全：</b>金鑰只存在這台裝置的瀏覽器，請求由瀏覽器直接送往供應商，不經過本服務的伺服器。
            所選供應商需允許瀏覽器跨域（OpenAI／Groq／OpenRouter 皆可）。
          </p>
        </div>
      </main>
    </div>
  )
}
