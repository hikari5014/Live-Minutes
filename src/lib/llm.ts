// Which model does the AI work (transcription + minutes).
// 'builtin' = our Worker with the server-side Gemini key (default).
// BYOK options talk to the provider DIRECTLY from the browser: the key lives in
// localStorage on this device only and never touches our server.
import { transcribeAudio, requestMinutesFromTranscript, backendAvailable, type GeminiUtterance } from './api'
import type { MinutesDoc } from './types'

export type LlmProvider = 'builtin' | 'gemini' | 'openai'

export interface LlmConfig {
  provider: LlmProvider
  geminiKey: string
  geminiModel: string
  oaiBase: string
  oaiKey: string
  oaiTextModel: string
  oaiAudioModel: string
}

export const DEFAULT_LLM: LlmConfig = {
  provider: 'builtin',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  oaiBase: 'https://api.openai.com/v1',
  oaiKey: '',
  oaiTextModel: 'gpt-4o-mini',
  oaiAudioModel: 'whisper-1',
}

const KEY = 'lm-llm'

export function getLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_LLM, ...(JSON.parse(raw) as Partial<LlmConfig>) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LLM }
}

export function setLlmConfig(patch: Partial<LlmConfig>): LlmConfig {
  const next = { ...getLlmConfig(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function llmLabel(cfg: LlmConfig = getLlmConfig()): string {
  if (cfg.provider === 'gemini') return `Gemini（個人金鑰 · ${cfg.geminiModel}）`
  if (cfg.provider === 'openai') return `OpenAI 相容（${cfg.oaiTextModel}）`
  return '內建（伺服器 Gemini）'
}

// ---------- shared helpers (exported for tests) ----------

export function secToClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`
}

/** Parse JSON that may arrive wrapped in code fences or surrounding prose. */
export function parseJsonLoose(text: string): unknown {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  if (!t.startsWith('{') && !t.startsWith('[')) {
    const i = t.indexOf('{')
    const j = t.lastIndexOf('}')
    if (i >= 0 && j > i) t = t.slice(i, j + 1)
  }
  return JSON.parse(t)
}

/** Whisper-style APIs return plain segments with no diarization; map them into
 *  our utterance shape (single anonymous speaker). */
export function whisperToUtterances(data: { text?: string; segments?: { start: number; text: string }[] }): GeminiUtterance[] {
  const segs = data.segments
  if (segs?.length) {
    return segs
      .filter((s) => (s.text ?? '').trim())
      .map((s) => ({ speaker: '發言者 1', text: s.text.trim(), start: secToClock(s.start) }))
  }
  const t = (data.text ?? '').trim()
  return t ? [{ speaker: '發言者 1', text: t, start: '00:00' }] : []
}

/** Normalize a possibly-sloppy minutes object from a generic chat model. */
export function coerceMinutes(parsed: unknown, title: string, lang: string): MinutesDoc {
  const p = (parsed ?? {}) as Record<string, unknown>
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  return {
    title: title || '會議紀錄',
    summary: typeof p.summary === 'string' ? p.summary : '',
    decisions: arr(p.decisions).map(String),
    actionItems: arr(p.actionItems).map((a) => {
      if (typeof a === 'string') return { text: a }
      const o = (a ?? {}) as Record<string, unknown>
      return { text: String(o.text ?? ''), ...(o.owner ? { owner: String(o.owner) } : {}) }
    }).filter((a) => a.text),
    topics: arr(p.topics).map((t) => {
      const o = (t ?? {}) as Record<string, unknown>
      return { title: String(o.title ?? ''), points: arr(o.points).map(String) }
    }).filter((t) => t.title),
    lang,
    createdAt: Date.now(),
  }
}

// ---------- prompts (mirror the worker's, for BYOK paths) ----------

const LANG_NAME: Record<string, string> = {
  'zh-Hant': '繁體中文', 'zh-Hans': '简体中文', en: 'English', ja: '日本語',
  ko: '한국어', de: 'Deutsch', fr: 'Français', es: 'Español',
}

export interface TranscribeOpts {
  lang: string
  participants?: string
  glossary?: string
  knownSpeakers?: string[]
  name?: string
}

function transcriptPrompt(o: TranscribeOpts): string {
  const langName = LANG_NAME[o.lang] ?? '繁體中文'
  const parts = (o.participants ?? '').split(/[,，、]/).map((x) => x.trim()).filter(Boolean)
  const gloss = (o.glossary ?? '').split(/[,，、]/).map((x) => x.trim()).filter(Boolean)
  const lines = [
    `你是專業的會議記錄員。請聽這段會議錄音，輸出「${langName}」的逐字稿。`,
    '要求：',
    `- 全部以「${langName}」輸出；若為中文請使用繁體字，不要簡體。`,
    '- 補上正確標點與斷句，讓句子可讀。',
    '- 移除「嗯、呃、就是、然後、那個」這類無意義口語贅字，但不要改寫或概括原意。',
    '- 保留原本說話者使用的英文專有名詞（不要音譯）。',
    '- 依說話者切分段落；start 欄位填該段開始時間，格式 MM:SS。',
    '- speakers 欄位列出你在這段音訊中辨識到的所有說話者名稱。',
  ]
  if (parts.length) {
    lines.push(
      `- 本次與會者名單：${parts.join('、')}。請依自我介紹、彼此稱呼與內容判斷每段是誰說的，speaker 直接填真實姓名；無法確定時才填「發言者 1」等，切勿張冠李戴。`,
    )
  } else {
    lines.push('- 無法得知真實姓名時，speaker 請填「發言者 1」「發言者 2」等，並在整段音訊中保持一致。')
  }
  if (o.knownSpeakers?.length) {
    lines.push(`- 這是同一場會議的後續片段，先前已識別的說話者為：${o.knownSpeakers.join('、')}。同一個人請沿用相同名稱。`)
  }
  if (gloss.length) lines.push(`- 專有名詞對照（請優先採用這些寫法）：${gloss.join('、')}。`)
  lines.push('僅根據音訊內容輸出，不要杜撰沒說過的話。')
  return lines.join('\n')
}

function minutesPrompt(transcript: string, title: string, lang: string, hints: MinutesHints, wantSchemaNote: boolean): string {
  const langName = LANG_NAME[lang] ?? '繁體中文'
  const lines = [
    `你是專業的會議記錄員。請閱讀以下會議逐字稿，輸出一份結構化的「${langName}」會議紀錄。`,
    '要求：',
    '- summary：3–5 句的會議摘要。',
    '- decisions：具體決議事項（沒有則空陣列）。',
    '- actionItems：待辦事項，text 為任務內容；若逐字稿有提到負責人則填 owner，否則省略。',
    '- topics：主要討論主題，每個含 title 與數個重點 points。',
    `務必以「${langName}」輸出所有文字，且僅根據逐字稿內容，不要杜撰。`,
  ]
  if (hints.participants) lines.push(`本次與會者：${hints.participants}。actionItems 的 owner 請盡量對應這些真實姓名，無法確定就省略。`)
  if (hints.glossary) lines.push(`專有名詞請採用以下寫法：${hints.glossary}。`)
  if (wantSchemaNote) {
    lines.push('只輸出一個 JSON 物件（不要加任何說明文字或 code fence），格式：')
    lines.push('{"summary":"...","decisions":["..."],"actionItems":[{"text":"...","owner":"..."}],"topics":[{"title":"...","points":["..."]}]}')
  }
  lines.push(`會議標題：${title || '（未命名）'}`, '', '逐字稿：', transcript.slice(0, 150_000))
  return lines.join('\n')
}

export interface MinutesHints {
  participants?: string
  glossary?: string
}

// ---------- Gemini BYOK (browser-direct) ----------

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_INLINE_MAX = 14 * 1024 * 1024 // inline base64 request cap is ~20MB

const TRANSCRIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    utterances: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { speaker: { type: 'STRING' }, text: { type: 'STRING' }, start: { type: 'STRING' } },
        required: ['speaker', 'text', 'start'],
      },
    },
    speakers: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['utterances', 'speakers'],
}

const MINUTES_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    decisions: { type: 'ARRAY', items: { type: 'STRING' } },
    actionItems: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, owner: { type: 'STRING' } }, required: ['text'] },
    },
    topics: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['title', 'points'],
      },
    },
  },
  required: ['summary', 'decisions', 'actionItems', 'topics'],
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function geminiGenerate(cfg: LlmConfig, parts: unknown[], schema: unknown | null): Promise<string> {
  const res = await fetch(`${GEMINI_BASE}/models/${cfg.geminiModel}:generateContent?key=${encodeURIComponent(cfg.geminiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: schema
        ? { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema }
        : { temperature: 0.2 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}：${(await res.text().catch(() => '')).slice(0, 160)}`)
  const d = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini 回應為空')
  return text
}

// ---------- OpenAI-compatible (browser-direct) ----------

function oaiHeaders(cfg: LlmConfig): Record<string, string> {
  const h: Record<string, string> = {}
  if (cfg.oaiKey) h.Authorization = `Bearer ${cfg.oaiKey}`
  return h
}

function extForMime(mime: string): string {
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

async function oaiChat(cfg: LlmConfig, prompt: string, wantJson: boolean): Promise<string> {
  const body = (json: boolean) =>
    JSON.stringify({
      model: cfg.oaiTextModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    })
  let res = await fetch(`${cfg.oaiBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...oaiHeaders(cfg) },
    body: body(wantJson),
  })
  if (!res.ok && wantJson) {
    // some compatible servers reject response_format — retry without it
    res = await fetch(`${cfg.oaiBase.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...oaiHeaders(cfg) },
      body: body(false),
    })
  }
  if (!res.ok) throw new Error(`API ${res.status}：${(await res.text().catch(() => '')).slice(0, 160)}`)
  const d = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = d.choices?.[0]?.message?.content
  if (!text) throw new Error('模型回應為空')
  return text
}

// ---------- public entry points ----------

/** Transcribe one audio blob with the configured provider. */
export async function llmTranscribeBlob(
  blob: Blob,
  mime: string,
  opts: TranscribeOpts,
): Promise<{ utterances: GeminiUtterance[]; speakers: string[] }> {
  const cfg = getLlmConfig()

  if (cfg.provider === 'gemini' && cfg.geminiKey) {
    if (blob.size > GEMINI_INLINE_MAX)
      throw new Error(`這段音訊 ${(blob.size / 1024 / 1024).toFixed(0)}MB 超過個人 Gemini 金鑰的單次上限（約 14MB），請改用內建服務`)
    const b64 = await blobToBase64(blob)
    const raw = await geminiGenerate(
      cfg,
      [{ text: transcriptPrompt(opts) }, { inline_data: { mime_type: mime, data: b64 } }],
      TRANSCRIPT_SCHEMA,
    )
    const parsed = parseJsonLoose(raw) as { utterances?: GeminiUtterance[]; speakers?: string[] }
    return { utterances: parsed.utterances ?? [], speakers: parsed.speakers ?? [] }
  }

  if (cfg.provider === 'openai' && (cfg.oaiKey || cfg.oaiBase)) {
    if (blob.size > 25 * 1024 * 1024) throw new Error('這段音訊超過語音辨識 API 的 25MB 上限')
    const attempt = async (fmt: 'verbose_json' | 'json') => {
      const fd = new FormData()
      fd.append('file', blob, `audio.${extForMime(mime)}`)
      fd.append('model', cfg.oaiAudioModel)
      fd.append('response_format', fmt)
      const res = await fetch(`${cfg.oaiBase.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: oaiHeaders(cfg),
        body: fd,
      })
      if (!res.ok) throw new Error(`API ${res.status}：${(await res.text().catch(() => '')).slice(0, 160)}`)
      return (await res.json()) as { text?: string; segments?: { start: number; text: string }[] }
    }
    let data
    try {
      data = await attempt('verbose_json')
    } catch {
      data = await attempt('json')
    }
    return { utterances: whisperToUtterances(data), speakers: [] }
  }

  const r = await transcribeAudio(blob, mime, { mode: 'transcript', ...opts })
  return { utterances: r.utterances ?? [], speakers: r.speakers ?? [] }
}

/** Generate minutes with the configured provider. */
export async function llmMinutes(transcript: string, title: string, lang: string, hints: MinutesHints): Promise<MinutesDoc> {
  const cfg = getLlmConfig()

  if (cfg.provider === 'gemini' && cfg.geminiKey) {
    const raw = await geminiGenerate(cfg, [{ text: minutesPrompt(transcript, title, lang, hints, false) }], MINUTES_SCHEMA)
    return coerceMinutes(parseJsonLoose(raw), title, lang)
  }

  if (cfg.provider === 'openai' && (cfg.oaiKey || cfg.oaiBase)) {
    const raw = await oaiChat(cfg, minutesPrompt(transcript, title, lang, hints, true), true)
    return coerceMinutes(parseJsonLoose(raw), title, lang)
  }

  return requestMinutesFromTranscript(transcript, title, lang, hints)
}

/** Quick connectivity check for the settings page. */
export async function llmTest(cfg: LlmConfig = getLlmConfig()): Promise<{ ok: boolean; message: string }> {
  try {
    if (cfg.provider === 'builtin') {
      const ok = await backendAvailable()
      return { ok, message: ok ? '內建服務連線正常' : '無法連上後端服務' }
    }
    if (cfg.provider === 'gemini') {
      if (!cfg.geminiKey) return { ok: false, message: '尚未填入 Gemini API 金鑰' }
      const r = await geminiGenerate(cfg, [{ text: '請只回覆兩個字母：OK' }], null)
      return { ok: true, message: `連線成功，模型回覆：${r.trim().slice(0, 40)}` }
    }
    if (!cfg.oaiKey && !/localhost|127\.0\.0\.1/.test(cfg.oaiBase)) return { ok: false, message: '尚未填入 API 金鑰' }
    const r = await oaiChat(cfg, '請只回覆兩個字母：OK', false)
    return { ok: true, message: `連線成功，模型回覆：${r.trim().slice(0, 40)}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
