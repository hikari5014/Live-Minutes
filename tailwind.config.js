/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: 'var(--ink)',
        body: 'var(--body)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        brand: 'var(--brand)',
        'brand-ink': 'var(--brand-ink)',
        zh: 'var(--zh)',
        'zh-ink': 'var(--zh-ink)',
        live: 'var(--live)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
      },
      fontFamily: {
        sans: [
          'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial',
          'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', 'sans-serif',
        ],
        mono: ['ui-monospace', 'SF Mono', 'JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { xl2: '18px' },
    },
  },
  plugins: [],
}
