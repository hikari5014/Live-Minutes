import { useEffect, useState } from 'react'
import { FORMAT_INFO, PRESETS, m4aSupported, type ConvertOpts, type OutFormat } from '../lib/convert'

const KEY = 'lm-convert-opts'

export function loadOpts(): ConvertOpts {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { format: 'mp3', ...PRESETS[0].opts, ...(JSON.parse(raw) as Partial<ConvertOpts>) }
  } catch {
    /* ignore */
  }
  return { format: 'mp3', ...PRESETS[0].opts }
}

function saveOpts(o: ConvertOpts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o))
  } catch {
    /* ignore */
  }
}

function Chip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex-1 rounded-full px-2 py-2 text-[12.5px] font-bold transition-colors disabled:opacity-35"
      style={active ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--muted)' }}
    >
      {children}
    </button>
  )
}

export function FormatPicker({ value, onChange }: { value: ConvertOpts; onChange: (o: ConvertOpts) => void }) {
  const [m4a, setM4a] = useState<boolean | null>(null)
  useEffect(() => {
    m4aSupported().then(setM4a)
  }, [])

  const set = (patch: Partial<ConvertOpts>) => {
    const next = { ...value, ...patch }
    saveOpts(next)
    onChange(next)
  }
  const preset = PRESETS.find((p) => p.opts.sampleRate === value.sampleRate && p.opts.channels === value.channels && p.opts.kbps === value.kbps)

  return (
    <div className="grid gap-3">
      <div>
        <div className="mb-1.5 text-[12px] font-bold text-muted">輸出格式</div>
        <div className="flex gap-1.5">
          {(Object.keys(FORMAT_INFO) as OutFormat[]).map((f) => (
            <Chip key={f} active={value.format === f} disabled={f === 'm4a' && m4a === false} onClick={() => set({ format: f })}>
              {FORMAT_INFO[f].label}
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-[11.5px] text-faint">
          {FORMAT_INFO[value.format].hint}
          {m4a === false && ' · 此瀏覽器沒有 AAC 編碼器，M4A 不可用'}
        </p>
      </div>
      {(
        <div>
          <div className="mb-1.5 text-[12px] font-bold text-muted">音質</div>
          <div className="flex gap-1.5">
            {PRESETS.map((p) => (
              <Chip key={p.key} active={preset?.key === p.key} onClick={() => set(p.opts)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-faint">
            {preset ? preset.hint : '自訂'} · {value.sampleRate / 1000} kHz
            {value.format !== 'wav' ? ` · ${value.kbps} kbps` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
