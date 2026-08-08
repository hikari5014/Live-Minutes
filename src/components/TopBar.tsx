import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toggleTheme, currentTheme } from '../lib/theme'
import { Moon, Settings, Sun } from './icons'

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
  const nav = useNavigate()
  return (
    <header
      className="safe-t sticky top-0 z-20 backdrop-blur-xl"
      style={{ background: 'color-mix(in srgb, var(--paper) 72%, transparent)' }}
    >
      <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2.5">
        <BrandMark size={24} />
        <div className="text-[15px] font-bold tracking-tight text-ink">Live Minutes</div>
        <span className="text-[10.5px] font-semibold text-faint">v{__APP_VERSION__}</span>
        {subtitle && <div className="text-[12px] font-semibold text-faint">· {subtitle}</div>}
        <button
          type="button"
          onClick={() => nav('/settings')}
          aria-label="設定"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-surface text-ink shadow-sm active:scale-95"
        >
          <Settings className="h-[17px] w-[17px]" />
        </button>
        <button
          type="button"
          onClick={() => setDark(toggleTheme() === 'dark')}
          aria-label="切換深淺色主題"
          className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink shadow-sm active:scale-95"
        >
          {dark ? <Moon className="h-[17px] w-[17px]" /> : <Sun className="h-[17px] w-[17px]" />}
        </button>
      </div>
    </header>
  )
}
