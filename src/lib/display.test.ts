import { describe, it, expect } from 'vitest'
import { sourcePx, translationPx, FONT_SOURCE_PX, FONT_TRANSLATION_PX, CHUNK_OPTIONS, WAIT_OPTIONS } from './display'

describe('display', () => {
  it('maps font level 1..5 and clamps out-of-range', () => {
    expect(sourcePx(1)).toBe(FONT_SOURCE_PX[0])
    expect(sourcePx(5)).toBe(FONT_SOURCE_PX[4])
    expect(sourcePx(0)).toBe(FONT_SOURCE_PX[0])
    expect(sourcePx(99)).toBe(FONT_SOURCE_PX[4])
    expect(translationPx(3)).toBe(FONT_TRANSLATION_PX[2])
  })
  it('offers "immediate" as the first batching option', () => {
    expect(CHUNK_OPTIONS[0].v).toBe(0)
    expect(WAIT_OPTIONS[0].v).toBe(0)
  })
})
