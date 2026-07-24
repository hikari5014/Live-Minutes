import { useState } from 'react'
import { toggleTheme, currentTheme } from '../lib/theme'
import { Moon, Sun } from './icons'

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block flex-none rounded-lg"
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(120% 120% at 30% 20%, var(--brand) 0%, var(--brand-ink) 70%)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <span
        className="absolute inset-0 rounded-lg"
        style={{ background: 'radial-gradient(circle at 68% 70%, rgba(255,255,255,.85) 0 2.5px, transparent 3.5px)' }}
      />
    </span>
  )
}

export function TopBar({ subtitle }: { subtitle?: string }) {
  const [dark, setDark] = useState(currentTheme() === 'dark')
  return (
    <header
      className="safe-t sticky top-0 z-20 border-b border-line backdrop-blur"
      style={{ background: 'color-mix(in srgb, var(--paper) 82%, transparent)' }}
    >
      <div className="mx-auto flex max-w-md items-center gap-2.5 px-4 py-2.5">
        <BrandMark />
        <div className="font-extrabold tracking-tight text-ink">Live Minutes</div>
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold leading-none text-faint">v{__APP_VERSION__}</span>
        {subtitle && <div className="text-xs font-semibold text-faint">{subtitle}</div>}
        <button
          type="button"
          onClick={() => setDark(toggleTheme() === 'dark')}
          aria-label="切換深淺色主題"
          className="ml-auto grid h-9 w-9 place-items-center rounded-[10px] border border-line-strong bg-surface text-ink"
        >
          {dark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </header>
  )
}
