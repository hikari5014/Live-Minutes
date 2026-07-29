import { describe, it, expect, afterEach, vi } from 'vitest'
import { tabAudioSupported, tabAudioBlockedReason, isIOS, sourceLabel } from './audiosource'

const CHROME_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0'

function env(ua: string, opts: { display?: boolean; coarse?: boolean; touchPoints?: number; width?: number } = {}) {
  vi.stubGlobal('navigator', {
    userAgent: ua,
    platform: ua.includes('iPhone') ? 'iPhone' : 'MacIntel',
    maxTouchPoints: opts.touchPoints ?? 0,
    mediaDevices: opts.display === false ? {} : { getDisplayMedia: () => Promise.resolve(null) },
  })
  vi.stubGlobal('window', {
    innerWidth: opts.width ?? 1440,
    matchMedia: (q: string) => ({ matches: q.includes('coarse') ? !!opts.coarse : false }),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('tab audio capability', () => {
  it('is available on desktop Chromium with getDisplayMedia', () => {
    env(CHROME_DESKTOP)
    expect(tabAudioSupported()).toBe(true)
    expect(tabAudioBlockedReason()).toBeNull()
  })

  it('is unavailable on iOS and explains why', () => {
    env(IPHONE_SAFARI, { display: false, touchPoints: 5 })
    expect(isIOS()).toBe(true)
    expect(tabAudioSupported()).toBe(false)
    expect(tabAudioBlockedReason()).toContain('iOS')
  })

  it('is unavailable on Firefox and says so', () => {
    env(FIREFOX)
    expect(tabAudioSupported()).toBe(false)
    expect(tabAudioBlockedReason()).toContain('Chrome')
  })

  it('is unavailable when the API is missing', () => {
    env(CHROME_DESKTOP, { display: false })
    expect(tabAudioSupported()).toBe(false)
    expect(tabAudioBlockedReason()).toContain('不支援')
  })

  it('is unavailable on a phone-sized touch device', () => {
    env(CHROME_DESKTOP, { coarse: true, width: 420 })
    expect(tabAudioSupported()).toBe(false)
  })
})

describe('sourceLabel', () => {
  it('names each source', () => {
    expect(sourceLabel('mic')).toBe('麥克風')
    expect(sourceLabel('tab')).toBe('分頁音訊')
    expect(sourceLabel('both')).toBe('麥克風＋分頁音訊')
  })
})
