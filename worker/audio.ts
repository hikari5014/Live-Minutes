import type { Env } from './types'

// Audio → Gemini. The browser holds the recording; the Worker proxies it to the
// Files API (so the key never reaches the client) and asks Gemini to transcribe.
// Audio is not persisted server-side — Gemini's Files API expires uploads on its
// own, and we store nothing.

const BASE = 'https://generativelanguage.googleapis.com'

const TRANSCRIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    utterances: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          speaker: { type: 'STRING' },
          text: { type: 'STRING' },
          start: { type: 'STRING' },
        },
        required: ['speaker', 'text', 'start'],
      },
    },
    speakers: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['utterances', 'speakers'],
}

const LANG_NAME: Record<string, string> = {
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
}

/** Upload bytes to the Gemini Files API (resumable protocol) and return the file URI. */
export async function uploadToGemini(env: Env, bytes: ArrayBuffer, mime: string, name: string): Promise<string> {
  const key = env.GEMINI_API_KEY
  if (!key) throw new Error('missing GEMINI_API_KEY')
  const start = await fetch(`${BASE}/upload/v1beta/files?key=${key}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: name } }),
  })
  if (!start.ok) throw new Error(`files start ${start.status} ${await start.text().catch(() => '')}`)
  const uploadUrl = start.headers.get('X-Goog-Upload-URL') || start.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('files start: no upload url')

  const put = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  })
  if (!put.ok) throw new Error(`files upload ${put.status} ${await put.text().catch(() => '')}`)
  const data = (await put.json()) as { file?: { uri?: string; state?: string } }
  const uri = data.file?.uri
  if (!uri) throw new Error('files upload: no uri')
  return uri
}

async function callGemini(env: Env, parts: unknown[], structured: boolean): Promise<string> {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash'
  const res = await fetch(`${BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: structured
        ? { temperature: 0.2, responseMimeType: 'application/json', responseSchema: TRANSCRIPT_SCHEMA }
        : { temperature: 0.2 },
    }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status} ${await res.text().catch(() => '')}`)
  const d = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('gemini empty response')
  return text
}

/** Free-form listen (used by the device diagnostics end-to-end check). */
export async function listenText(env: Env, uri: string, mime: string, prompt: string): Promise<string> {
  return (await callGemini(env, [{ text: prompt }, { file_data: { mime_type: mime, file_uri: uri } }], false)).trim()
}

export interface TranscriptOut {
  utterances: { speaker: string; text: string; start: string }[]
  speakers: string[]
}

/** Authoritative transcript for one audio segment. `knownSpeakers` carries the
 *  roster forward across segments so "發言者 A" stays the same person. */
export async function transcribeSegment(
  env: Env,
  uri: string,
  mime: string,
  opts: { lang: string; participants: string[]; knownSpeakers: string[]; glossary: string[] },
): Promise<TranscriptOut> {
  const langName = LANG_NAME[opts.lang] ?? '繁體中文'
  const lines = [
    `你是專業的會議記錄員。請聽這段會議錄音，輸出「${langName}」的逐字稿。`,
    '要求：',
    `- 全部以「${langName}」輸出；若為中文請使用繁體字，不要簡體。`,
    '- 補上正確標點與斷句，讓句子可讀。',
    '- 移除「嗯、呃、就是、然後、那個」這類無意義口語贅字，但**不要改寫或概括原意**。',
    '- 保留原本說話者使用的英文專有名詞（不要音譯）。',
    '- 依說話者切分段落；start 欄位填該段開始時間，格式 MM:SS。',
    '- speakers 欄位列出你在這段音訊中辨識到的所有說話者名稱。',
  ]
  if (opts.participants.length) {
    lines.push(
      `- 本次與會者名單：${opts.participants.join('、')}。`,
      '  請盡量依自我介紹、彼此稱呼與內容判斷每段是誰說的，speaker 直接填真實姓名；',
      '  無法確定時才填「發言者 1」「發言者 2」等，切勿張冠李戴。',
    )
  } else {
    lines.push('- 無法得知真實姓名時，speaker 請填「發言者 1」「發言者 2」等，並在整段音訊中保持一致。')
  }
  if (opts.knownSpeakers.length) {
    lines.push(
      `- 這是同一場會議的後續片段，先前已識別的說話者為：${opts.knownSpeakers.join('、')}。`,
      '  若是同一個人請沿用相同名稱，不要新編號；只有出現新的人才新增名稱。',
    )
  }
  if (opts.glossary.length) {
    lines.push(`- 專有名詞對照（請優先採用這些寫法）：${opts.glossary.join('、')}。`)
  }
  lines.push('僅根據音訊內容輸出，不要杜撰沒說過的話。')

  const raw = await callGemini(env, [{ text: lines.join('\n') }, { file_data: { mime_type: mime, file_uri: uri } }], true)
  const parsed = JSON.parse(raw) as Partial<TranscriptOut>
  return { utterances: parsed.utterances ?? [], speakers: parsed.speakers ?? [] }
}
