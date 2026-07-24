import type { ReactNode } from 'react'
import { ChevronDown } from './icons'

export function Select({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
  children: ReactNode
}) {
  return (
    <div className="relative flex-1">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-line bg-surface px-3 py-2.5 pr-9 text-sm font-bold text-ink"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
    </div>
  )
}
