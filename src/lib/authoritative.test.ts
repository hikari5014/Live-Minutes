import { describe, it, expect } from 'vitest'
import { parseClock, rosterIndex, toUtterances } from './authoritative'

describe('parseClock', () => {
  it('parses MM:SS and HH:MM:SS', () => {
    expect(parseClock('00:00')).toBe(0)
    expect(parseClock('01:05')).toBe(65_000)
    expect(parseClock('1:05')).toBe(65_000)
    expect(parseClock('01:02:03')).toBe(3_723_000)
  })
  it('is forgiving about junk', () => {
    expect(parseClock('')).toBe(0)
    expect(parseClock('abc')).toBe(0)
    expect(parseClock('12')).toBe(12_000)
  })
})

describe('rosterIndex', () => {
  it('assigns stable indices in first-appearance order', () => {
    const r: string[] = []
    expect(rosterIndex(r, 'Mark')).toBe(0)
    expect(rosterIndex(r, '小美')).toBe(1)
    expect(rosterIndex(r, 'Mark')).toBe(0)
    expect(r).toEqual(['Mark', '小美'])
  })
  it('trims and falls back for blank names', () => {
    const r: string[] = []
    expect(rosterIndex(r, '  Mark  ')).toBe(0)
    expect(rosterIndex(r, '')).toBe(1)
    expect(r).toEqual(['Mark', '發言者'])
  })
})

describe('toUtterances', () => {
  it('offsets segment timestamps into meeting time and keeps roster stable', () => {
    const roster: string[] = ['Mark']
    const out = toUtterances(
      [
        { speaker: 'Mark', text: '我們下週一發布。', start: '00:05' },
        { speaker: '小美', text: '我負責測試。', start: '00:20' },
      ],
      600_000, // second segment starts at 10 min
      roster,
    )
    expect(out).toHaveLength(2)
    expect(out[0].ts).toBe(605_000)
    expect(out[1].ts).toBe(620_000)
    expect(out[0].speaker).toBe(0) // Mark keeps index 0 across segments
    expect(out[1].speaker).toBe(1)
    expect(roster).toEqual(['Mark', '小美'])
  })
  it('drops empty utterances', () => {
    expect(toUtterances([{ speaker: 'A', text: '   ', start: '00:01' }], 0, [])).toHaveLength(0)
  })
})
