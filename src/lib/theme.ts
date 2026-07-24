// Theme: follow system, allow manual toggle. Stamps data-theme on <html>.
export type Theme = 'light' | 'dark'

const KEY = 'lm-theme'

export function initTheme(): void {
  try {
    const stored = localStorage.getItem(KEY) as Theme | null
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored)
    }
  } catch {
    /* ignore */
  }
}

export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* ignore */
  }
  return next
}
