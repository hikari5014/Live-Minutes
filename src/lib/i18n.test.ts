import { describe, it, expect } from 'vitest'
import { t, uiLang } from './i18n'

describe('i18n', () => {
  it('falls back to zh for an unknown language', () => {
    expect(t('xx', 'ended')).toBe(t('zh', 'ended'))
  })
  it('uses the requested language when available', () => {
    expect(t('en', 'viewMinutes')).toBe('View minutes')
    expect(t('ja', 'ended')).toBe('会議は終了しました')
  })
  it('uiLang returns the chosen subtitle language when known', () => {
    expect(uiLang('ja')).toBe('ja')
    expect(uiLang('en')).toBe('en')
  })
})
