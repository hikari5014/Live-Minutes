import type { MinutesDoc, SessionMeta, Utterance } from './types'
import { fromMs } from './format'
import { speakerLabel } from './langs'

export function transcriptText(utterances: Utterance[], withTranslation: boolean): string {
  return utterances
    .map((u) => {
      const head = `[${fromMs(u.ts)}] ${speakerLabel(u.speaker)}`
      const tr = withTranslation && u.translation ? `\n    ↳ ${u.translation}` : ''
      return `${head}: ${u.source}${tr}`
    })
    .join('\n')
}

export function minutesMarkdown(meta: SessionMeta, minutes: MinutesDoc | null, utterances: Utterance[]): string {
  const out: string[] = []
  out.push(`# ${meta.title}`, '')
  out.push(`- 日期：${new Date(meta.createdAt).toLocaleString('zh-TW')}`)
  out.push(`- 時長：約 ${Math.max(1, Math.round(meta.durationSec / 60))} 分`)
  out.push('')
  if (minutes) {
    out.push('## 摘要', '', minutes.summary, '')
    if (minutes.decisions.length) {
      out.push('## 決議事項', '')
      minutes.decisions.forEach((d) => out.push(`- ${d}`))
      out.push('')
    }
    if (minutes.actionItems.length) {
      out.push('## 待辦事項', '')
      minutes.actionItems.forEach((a) => out.push(`- [ ] ${a.text}${a.owner ? `（${a.owner}）` : ''}`))
      out.push('')
    }
    if (minutes.topics.length) {
      out.push('## 討論主題', '')
      minutes.topics.forEach((t) => {
        out.push(`### ${t.title}`)
        t.points.forEach((p) => out.push(`- ${p}`))
        out.push('')
      })
    }
  }
  out.push('## 逐字稿', '', transcriptText(utterances, true))
  return out.join('\n')
}

export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
