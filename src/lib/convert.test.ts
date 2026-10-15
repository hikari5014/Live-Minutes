import { describe, it, expect } from 'vitest'
import { wavHeader, floatTo16, mixdown, estimateBytes, baseName } from './convert'

const fakeBuffer = (chs: number[][]) => ({
  numberOfChannels: chs.length,
  getChannelData: (i: number) => Float32Array.from(chs[i]),
})

describe('wavHeader', () => {
  it('writes a valid 44-byte PCM RIFF header', () => {
    const v = new DataView(wavHeader(1000, 22050, 1))
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)))
    expect(tag(0)).toBe('RIFF')
    expect(tag(8)).toBe('WAVE')
    expect(tag(36)).toBe('data')
    expect(v.getUint32(4, true)).toBe(1036)
    expect(v.getUint16(20, true)).toBe(1) // PCM
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(22050)
    expect(v.getUint32(28, true)).toBe(44100) // byte rate
    expect(v.getUint32(40, true)).toBe(1000)
  })
})

describe('floatTo16', () => {
  it('scales and clips', () => {
    expect([...floatTo16(Float32Array.from([0, 1, -1, 2, -2]))]).toEqual([0, 32767, -32768, 32767, -32768])
  })
})

describe('mixdown', () => {
  it('averages stereo to mono', () => {
    const out = mixdown(fakeBuffer([[1, 0.5], [0, 0.5]]), 1, 0, 2)
    expect(out).toHaveLength(1)
    expect([...out[0]]).toEqual([0.5, 0.5])
  })
  it('duplicates mono to stereo', () => {
    const out = mixdown(fakeBuffer([[0.25, 0.75]]), 2, 0, 2)
    expect(out.map((p) => [...p])).toEqual([[0.25, 0.75], [0.25, 0.75]])
  })
  it('respects the slice window', () => {
    expect([...mixdown(fakeBuffer([[1, 2, 3, 4]]), 1, 1, 3)[0]]).toEqual([2, 3])
  })
})

describe('estimateBytes', () => {
  it('uses bitrate for compressed and PCM size for wav', () => {
    expect(estimateBytes(60, { format: 'mp3', sampleRate: 22050, channels: 1, kbps: 64 })).toBe(480_000)
    expect(estimateBytes(1, { format: 'wav', sampleRate: 16000, channels: 1, kbps: 0 })).toBe(32_044)
  })
})

describe('baseName', () => {
  it('strips the extension', () => {
    expect(baseName('會議.final.webm')).toBe('會議.final')
    expect(baseName('noext')).toBe('noext')
  })
})
