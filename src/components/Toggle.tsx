export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-left"
    >
      <span>
        <span className="block text-sm font-bold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-faint">{hint}</span>}
      </span>
      <span
        className="relative ml-auto h-[22px] w-[38px] flex-none rounded-full transition-colors"
        style={{ background: checked ? 'var(--brand)' : 'var(--border-strong)' }}
      >
        <span
          className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
          style={{ left: checked ? '18px' : '2px' }}
        />
      </span>
    </button>
  )
}
