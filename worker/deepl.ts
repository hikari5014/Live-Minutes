import type { Env } from './types'

// Translate one segment. source/target are DeepL language codes (e.g. EN, ZH-HANT).
// Without a key the text passes through unchanged so the app still runs.
export async function translate(env: Env, text: string, source: string, target: string): Promise<{ text: string; detected: string }> {
  if (!env.DEEPL_API_KEY) return { text, detected: '' }
  if (!text.trim()) return { text, detected: '' }
  const host = env.DEEPL_API_HOST || 'https://api-free.deepl.com'
  const body = new URLSearchParams()
  body.set('text', text)
  body.set('target_lang', target)
  if (source) body.set('source_lang', source)

  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${env.DEEPL_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) throw new Error(`deepl ${res.status}`)
  const data = (await res.json()) as { translations?: { text: string; detected_source_language?: string }[] }
  const tr = data.translations?.[0]
  return { text: tr?.text ?? text, detected: tr?.detected_source_language ?? '' }
}
