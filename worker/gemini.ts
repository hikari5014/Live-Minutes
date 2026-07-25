import type { Env, MinutesDoc } from './types'

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    decisions: { type: 'ARRAY', items: { type: 'STRING' } },
    actionItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { text: { type: 'STRING' }, owner: { type: 'STRING' } },
        required: ['text'],
      },
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

const CHUNK_LIMIT = 100_000
const CHUNK_SIZE = 80_000

export async function generateMinutes(env: Env, transcript: string, title: string, lang: string): Promise<MinutesDoc> {
  if (!env.GEMINI_API_KEY) throw new Error('missing GEMINI_API_KEY')
  const langName = LANG_NAME[lang] ?? '繁體中文'
  if (transcript.length <= CHUNK_LIMIT) return oneShot(env, transcript, title, lang, langName)

  // Long meeting: map each chunk to partial notes, then reduce/merge.
  const chunks = chunkText(transcript, CHUNK_SIZE)
  const partials: MinutesDoc[] = []
  for (let i = 0; i < chunks.length; i++) {
    partials.push(await oneShot(env, chunks[i], `${title}（第 ${i + 1}/${chunks.length} 段）`, lang, langName))
  }
  return mergePartials(env, partials, title, lang, langName)
}

function model(env: Env): string {
  return env.GEMINI_MODEL || 'gemini-2.5-flash'
}

async function oneShot(env: Env, transcript: string, title: string, lang: string, langName: string): Promise<MinutesDoc> {
  const prompt = [
    `你是專業的會議記錄員。請閱讀以下會議逐字稿，輸出一份結構化的「${langName}」會議紀錄。`,
    '要求：',
    '- summary：3–5 句的會議摘要。',
    '- decisions：具體決議事項（沒有則空陣列）。',
    '- actionItems：待辦事項，text 為任務內容；若逐字稿有提到負責人則填 owner，否則省略。',
    '- topics：主要討論主題，每個含 title 與數個重點 points。',
    `務必以「${langName}」輸出所有文字，且僅根據逐字稿內容，不要杜撰。`,
    `會議標題：${title || '（未命名）'}`,
    '',
    '逐字稿：',
    transcript,
  ].join('\n')
  const text = await callGemini(env, prompt, true)
  const parsed = JSON.parse(text) as Partial<MinutesDoc>
  return {
    title: title || '會議紀錄',
    summary: parsed.summary ?? '',
    decisions: parsed.decisions ?? [],
    actionItems: parsed.actionItems ?? [],
    topics: parsed.topics ?? [],
    lang,
    createdAt: Date.now(),
  }
}

async function mergePartials(env: Env, parts: MinutesDoc[], title: string, lang: string, langName: string): Promise<MinutesDoc> {
  const decisions = uniq(parts.flatMap((p) => p.decisions))
  const actionItems = uniqBy(parts.flatMap((p) => p.actionItems), (a) => a.text)
  const topics = parts.flatMap((p) => p.topics)
  const joined = parts.map((p, i) => `段落 ${i + 1}：${p.summary}`).join('\n')
  let summary: string
  try {
    summary = (await callGemini(env, `以下是一場長會議各段落的摘要，請用「${langName}」整合成一段 3–5 句的整體摘要，只輸出摘要文字：\n\n${joined}`, false)).trim()
  } catch {
    summary = parts.map((p) => p.summary).join(' ')
  }
  return { title: title || '會議紀錄', summary, decisions, actionItems, topics, lang, createdAt: Date.now() }
}

async function callGemini(env: Env, prompt: string, structured: boolean): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model(env)}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: structured
          ? { temperature: 0.3, responseMimeType: 'application/json', responseSchema: SCHEMA }
          : { temperature: 0.3 },
      }),
    },
  )
  if (!res.ok) throw new Error(`gemini ${res.status} ${await res.text().catch(() => '')}`)
  const d = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('gemini empty response')
  return text
}

function chunkText(text: string, size: number): string[] {
  const lines = text.split('\n')
  const chunks: string[] = []
  let cur = ''
  for (const line of lines) {
    if (cur && cur.length + line.length + 1 > size) {
      chunks.push(cur)
      cur = ''
    }
    cur += (cur ? '\n' : '') + line
  }
  if (cur) chunks.push(cur)
  return chunks
}

function uniq(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of arr) {
    const k = s.trim().toLowerCase()
    if (k && !seen.has(k)) {
      seen.add(k)
      out.push(s)
    }
  }
  return out
}

function uniqBy<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of arr) {
    const k = key(x).trim().toLowerCase()
    if (k && !seen.has(k)) {
      seen.add(k)
      out.push(x)
    }
  }
  return out
}
