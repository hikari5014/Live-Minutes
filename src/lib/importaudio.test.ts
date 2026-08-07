import { describe, it, expect } from 'vitest'
import { clock, extOf, planWindows, dedupe, AUDIO_TOKENS_PER_SEC, MAX_UPLOAD_BYTES } from './importaudio'
import type { Utterance } from './types'

const utt = (ts: number, source: string, speaker = 0): Utterance => ({
  id: crypto.randomUUID(), speaker, source, translation: null, ts, final: true,
})

describe('clock', () => {
  it('formats MM:SS and H:MM:SS', () => {
    expect(clock(0)).toBe('00:00')
    expect(clock(65)).toBe('01:05')
    expect(clock(3600)).toBe('1:00:00')
    expect(clock(3725)).toBe('1:02:05')
  })
  it('never goes negative', () => {
    expect(clock(-5)).toBe('00:00')
  })
})

describe('extOf', () => {
  it('extracts a lowercase extension', () => {
    expect(extOf('meeting.M4A')).toBe('m4a')
    expect(extOf('a.b.mp3')).toBe('mp3')
    expect(extOf('noext')).toBe('')
  })
})

describe('planWindows', () => {
  it('uses a single pass for short files', () => {
    expect(planWindows(0)).toEqual([])
    expect(planWindows(15 * 60)).toEqual([])
    expect(planWindows(20 * 60)).toEqual([])
  })

  it('splits long files into overlapping windows covering the whole duration', () => {
    const w = planWindows(35 * 60)
    expect(w.length).toBeGreaterThan(1)
    expect(w[0].start).toBe('00:00')
    // every window after the first starts earlier than its nominal boundary
    expect(w[1].start).toBe('09:45')
    // coverage reaches the end
    expect(w[w.length - 1].end).toBe('35:00')
  })

  it('formats hour-long windows correctly', () => {
    const w = planWindows(90 * 60)
    expect(w[w.length - 1].end).toBe('1:30:00')
  })
})

describe('dedupe', () => {
  it('sorts by timestamp', () => {
    const out = dedupe([utt(3000, 'c'), utt(1000, 'a'), utt(2000, 'b')])
    expect(out.map((u) => u.source)).toEqual(['a', 'b', 'c'])
  })

  it('drops the same line repeated across an overlap boundary', () => {
    const out = dedupe([utt(600_000, '我們下週一發布'), utt(602_000, '我們下週一發布')])
    expect(out).toHaveLength(1)
  })

  it('keeps an identical line said again much later', () => {
    const out = dedupe([utt(10_000, '好的'), utt(900_000, '好的')])
    expect(out).toHaveLength(2)
  })

  it('keeps the same words from different speakers', () => {
    const out = dedupe([utt(10_000, '好的', 0), utt(11_000, '好的', 1)])
    expect(out).toHaveLength(2)
  })
})

describe('constants', () => {
  it('stays under the measured 100MB Worker limit', () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(100 * 1024 * 1024)
  })
  it('uses the measured audio token rate', () => {
    expect(AUDIO_TOKENS_PER_SEC).toBe(32)
  })
})
