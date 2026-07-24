import type { Env } from './types'

// Best-effort usage/quota lookup per provider. Each provider is isolated so one
// failure doesn't break the others. Gemini's free tier exposes no usage API.
export interface UsagePayload {
  deepl: { configured: boolean; used?: number; limit?: number; error?: string }
  deepgram: { configured: boolean; balance?: number | null; units?: string; error?: string }
  gemini: { available: false; note: string }
}

export async function getUsage(env: Env): Promise<UsagePayload> {
  const [deepl, deepgram] = await Promise.all([deeplUsage(env), deepgramUsage(env)])
  return {
    deepl,
    deepgram,
    gemini: { available: false, note: 'Gemini 免費層沒有用量查詢 API，無法顯示剩餘額度。' },
  }
}

async function deeplUsage(env: Env): Promise<UsagePayload['deepl']> {
  if (!env.DEEPL_API_KEY) return { configured: false }
  try {
    const host = env.DEEPL_API_HOST || 'https://api-free.deepl.com'
    const res = await fetch(`${host}/v2/usage`, {
      headers: { Authorization: `DeepL-Auth-Key ${env.DEEPL_API_KEY}` },
    })
    if (!res.ok) return { configured: true, error: `deepl ${res.status}` }
    const d = (await res.json()) as { character_count?: number; character_limit?: number }
    return { configured: true, used: d.character_count ?? 0, limit: d.character_limit ?? 0 }
  } catch (e) {
    return { configured: true, error: String(e) }
  }
}

async function deepgramUsage(env: Env): Promise<UsagePayload['deepgram']> {
  if (!env.DEEPGRAM_API_KEY) return { configured: false }
  const auth = { Authorization: `Token ${env.DEEPGRAM_API_KEY}` }
  try {
    const pr = await fetch('https://api.deepgram.com/v1/projects', { headers: auth })
    if (!pr.ok) return { configured: true, error: `projects ${pr.status}` }
    const pj = (await pr.json()) as { projects?: { project_id: string }[] }
    const pid = pj.projects?.[0]?.project_id
    if (!pid) return { configured: true, error: 'no project' }
    const br = await fetch(`https://api.deepgram.com/v1/projects/${pid}/balances`, { headers: auth })
    if (!br.ok) return { configured: true, error: `balances ${br.status}` }
    const bd = (await br.json()) as { balances?: { amount?: number; units?: string }[] }
    const bal = bd.balances?.[0]
    return { configured: true, balance: bal?.amount ?? null, units: bal?.units ?? 'usd' }
  } catch (e) {
    return { configured: true, error: String(e) }
  }
}
