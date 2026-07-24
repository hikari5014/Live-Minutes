const DELAYS = [0, 0.15, 0.3, 0.45, 0.6, 0.2, 0.5]

export function Wave({ active = true }: { active?: boolean }) {
  return (
    <div className="flex h-5 items-center gap-[3px]" aria-hidden>
      {DELAYS.map((d, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm"
          style={{
            height: '30%',
            background: 'var(--brand)',
            animation: active ? `wv 1.1s ease-in-out ${d}s infinite` : 'none',
          }}
        />
      ))}
    </div>
  )
}
