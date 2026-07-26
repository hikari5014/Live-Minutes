import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { to: '/settings', label: '一般', icon: 'edit' },
  { to: '/settings/archived', label: '封存', icon: 'archive' },
  { to: '/settings/folders', label: '資料夾', icon: 'folder' },
]

// Top-level tabs for the settings area: general preferences, archived
// meetings, and folder management each get their own page.
export function SettingsTabs() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  return (
    <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
      {TABS.map((t) => {
        const active = pathname === t.to
        return (
          <button
            key={t.to}
            type="button"
            onClick={() => nav(t.to)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-bold transition-colors"
            style={active ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--muted)' }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 17 }}>
              {t.icon}
            </span>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
