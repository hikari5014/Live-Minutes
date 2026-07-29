import { describe, it, expect } from 'vitest'
import { locate, segKey, type SegmentMeta } from './audiodb'

const seg = (i: number, startMs: number, durationMs: number): SegmentMeta => ({
  sessionId: 's', seg: i, mime: 'audio/webm', startMs, durationMs, bytes: 100,
})

describe('audiodb segment mapping', () => {
  const segs = [seg(0, 0, 600_000), seg(1, 600_000, 600_000), seg(2, 1_200_000, 300_000)]

  it('locates a timestamp inside the right segment', () => {
    expect(locate(segs, 0)?.seg.seg).toBe(0)
    expect(locate(segs, 599_999)?.seg.seg).toBe(0)
    expect(locate(segs, 600_000)?.seg.seg).toBe(1)
    expect(locate(segs, 1_250_000)?.seg.seg).toBe(2)
  })

  it('returns the offset within that segment in seconds', () => {
    expect(locate(segs, 630_000)?.offsetSec).toBe(30)
    expect(locate(segs, 1_200_000)?.offsetSec).toBe(0)
  })

  it('clamps past-the-end timestamps to the last segment', () => {
    const r = locate(segs, 9_999_999)
    expect(r?.seg.seg).toBe(2)
    expect(r?.offsetSec).toBeGreaterThan(0)
  })

  it('handles an empty segment list', () => {
    expect(locate([], 1000)).toBeNull()
  })

  it('builds sortable, zero-padded segment keys', () => {
    expect(segKey('abc', 2)).toBe('abc|0002')
    expect(segKey('abc', 11) > segKey('abc', 2)).toBe(true)
  })
})
