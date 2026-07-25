import { describe, it, expect } from 'vitest'
import { mmss, fromMs, durationLabel } from './format'

describe('format', () => {
  it('mmss pads minutes and seconds', () => {
    expect(mmss(0)).toBe('00:00')
    expect(mmss(65)).toBe('01:05')
    expect(mmss(3599)).toBe('59:59')
  })
  it('fromMs floors to seconds', () => {
    expect(fromMs(65_000)).toBe('01:05')
    expect(fromMs(1_999)).toBe('00:01')
  })
  it('durationLabel switches from 秒 to 分', () => {
    expect(durationLabel(45)).toBe('45 秒')
    expect(durationLabel(90)).toBe('2 分')
  })
})
