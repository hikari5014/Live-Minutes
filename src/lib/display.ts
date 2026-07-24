// Caption display helpers: font-size scales (5 levels) and translation-batching presets.

export const FONT_SOURCE_PX = [11, 13, 15, 17, 20]
export const FONT_TRANSLATION_PX = [15, 17, 20, 24, 28]

function clampLevel(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n || 1)))
}
export function sourcePx(level: number): number {
  return FONT_SOURCE_PX[clampLevel(level) - 1]
}
export function translationPx(level: number): number {
  return FONT_TRANSLATION_PX[clampLevel(level) - 1]
}

// 一次翻譯的段落長度（約略字數；0 = 逐句即時翻譯）
export const CHUNK_OPTIONS: { v: number; label: string }[] = [
  { v: 0, label: '逐句即時' },
  { v: 30, label: '短' },
  { v: 60, label: '中' },
  { v: 120, label: '長' },
]
// 批次翻譯的最長等待（秒）— 越短越即時、越長越省額度
export const WAIT_OPTIONS: { v: number; label: string }[] = [
  { v: 0, label: '即時' },
  { v: 1, label: '1 秒' },
  { v: 3, label: '3 秒' },
  { v: 6, label: '6 秒' },
]
