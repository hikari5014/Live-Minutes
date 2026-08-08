import { describe, it, expect, beforeEach } from 'vitest'
import {
  getLlmConfig,
  setLlmConfig,
  DEFAULT_LLM,
  parseJsonLoose,
  whisperToUtterances,
  coerceMinutes,
  secToClock,
  llmLabel,
} from './llm'

beforeEach(() => localStorage.clear())

describe('llm config', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getLlmConfig()).toEqual(DEFAULT_LLM)
  })
  it('round-trips and merges partial updates', () => {
    setLlmConfig({ provider: 'openai', oaiKey: 'sk-x' })
    const c = getLlmConfig()
    expect(c.provider).toBe('openai')
    expect(c.oaiKey).toBe('sk-x')
    expect(c.geminiModel).toBe(DEFAULT_LLM.geminiModel) // untouched fields keep defaults
  })
  it('labels each provider', () => {
    expect(llmLabel(DEFAULT_LLM)).toContain('內建')
    expect(llmLabel({ ...DEFAULT_LLM, provider: 'gemini' })).toContain('Gemini')
    expect(llmLabel({ ...DEFAULT_LLM, provider: 'openai' })).toContain('OpenAI')
  })
})

describe('parseJsonLoose', () => {
  it('parses plain JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 })
  })
  it('parses fenced JSON', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('parses JSON wrapped in prose', () => {
    expect(parseJsonLoose('好的，以下是結果：{"a":1} 希望有幫助')).toEqual({ a: 1 })
  })
})

describe('whisperToUtterances', () => {
  it('maps verbose segments with clock timestamps', () => {
    const out = whisperToUtterances({ segments: [{ start: 0, text: ' 大家好 ' }, { start: 65.4, text: '開始開會' }] })
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ speaker: '發言者 1', text: '大家好', start: '00:00' })
    expect(out[1].start).toBe('01:05')
  })
  it('falls back to a single utterance for plain text', () => {
    const out = whisperToUtterances({ text: '整段文字' })
    expect(out).toEqual([{ speaker: '發言者 1', text: '整段文字', start: '00:00' }])
  })
  it('returns empty for empty input', () => {
    expect(whisperToUtterances({})).toEqual([])
    expect(whisperToUtterances({ segments: [{ start: 0, text: '  ' }] })).toEqual([])
  })
})

describe('secToClock', () => {
  it('formats minutes and hours', () => {
    expect(secToClock(0)).toBe('00:00')
    expect(secToClock(65)).toBe('01:05')
    expect(secToClock(3725)).toBe('1:02:05')
  })
})

describe('coerceMinutes', () => {
  it('normalizes a sloppy chat-model reply', () => {
    const doc = coerceMinutes(
      {
        summary: '摘要',
        decisions: ['決議一'],
        actionItems: ['字串待辦', { text: '物件待辦', owner: 'Mark' }, { text: '' }],
        topics: [{ title: '主題', points: ['a', 'b'] }, { points: ['孤兒'] }],
      },
      '週會',
      'zh-Hant',
    )
    expect(doc.title).toBe('週會')
    expect(doc.actionItems).toEqual([{ text: '字串待辦' }, { text: '物件待辦', owner: 'Mark' }])
    expect(doc.topics).toEqual([{ title: '主題', points: ['a', 'b'] }])
    expect(doc.lang).toBe('zh-Hant')
  })
  it('survives garbage', () => {
    const doc = coerceMinutes(null, '', 'en')
    expect(doc.title).toBe('會議紀錄')
    expect(doc.decisions).toEqual([])
  })
})
