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

export async function generateMinutes(env: Env, transcript: string, title: string, lang: string): Promise<MinutesDoc> {
  if (!env.GEMINI_API_KEY) throw new Error('missing GEMINI_API_KEY')
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash'
  const prompt = [
    '你是專業的會議記錄員。請閱讀以下會議逐字稿，輸出一份結構化的「繁體中文」會議紀錄。',
    '要求：',
    '- summary：3–5 句的會議摘要。',
    '- decisions：具體決議事項（沒有則空陣列）。',
    '- actionItems：待辦事項，text 為任務內容；若逐字稿有提到負責人則填 owner，否則省略。',
    '- topics：主要討論主題，每個含 title 與數個重點 points。',
    '務必使用繁體中文，且僅根據逐字稿內容，不要杜撰。',
    `會議標題：${title || '（未命名）'}`,
    '',
    '逐字稿：',
    transcript.slice(0, 120000),
  ].join('\n')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    },
  )
  if (!res.ok) throw new Error(`gemini ${res.status} ${await res.text().catch(() => '')}`)
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('gemini empty response')
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
