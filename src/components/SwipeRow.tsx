import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

export interface SwipeAction {
  icon: string // Material Symbols name
  label: string
  color: string // button background (CSS color)
  onAction: () => void
}

const ACTION_W = 76

// A list row you can swipe: drag right to reveal `left` actions, drag left to
// reveal `right` actions. Tapping (without dragging) fires onTap; tapping while
// open closes it. Uses Pointer Events so it works with touch and mouse.
export function SwipeRow({
  left = [],
  right = [],
  onTap,
  children,
}: {
  left?: SwipeAction[]
  right?: SwipeAction[]
  onTap?: () => void
  children: ReactNode
}) {
  const leftW = left.length * ACTION_W
  const rightW = right.length * ACTION_W
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const baseDx = useRef(0)
  const moved = useRef(false)

  function down(e: PointerEvent) {
    startX.current = e.clientX
    baseDx.current = dx
    moved.current = false
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function move(e: PointerEvent) {
    if (!dragging) return
    const delta = e.clientX - startX.current
    if (Math.abs(delta) > 6) moved.current = true
    setDx(Math.max(-rightW, Math.min(leftW, baseDx.current + delta)))
  }
  function up() {
    if (!dragging) return
    setDragging(false)
    if (rightW && dx <= -rightW / 2) setDx(-rightW)
    else if (leftW && dx >= leftW / 2) setDx(leftW)
    else setDx(0)
  }
  function tap() {
    if (moved.current) return
    if (dx !== 0) {
      setDx(0)
      return
    }
    onTap?.()
  }
  function fire(a: SwipeAction) {
    setDx(0)
    a.onAction()
  }

  function Actions({ list, side }: { list: SwipeAction[]; side: 'left' | 'right' }) {
    return (
      <div className={`absolute inset-y-0 ${side}-0 flex`}>
        {list.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => fire(a)}
            style={{ width: ACTION_W, background: a.color }}
            className="flex flex-col items-center justify-center gap-0.5 text-white"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
              {a.icon}
            </span>
            <span className="text-[10px] font-bold">{a.label}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-line">
      {left.length > 0 && <Actions list={left} side="left" />}
      {right.length > 0 && <Actions list={right} side="right" />}
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={tap}
        className="relative"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform .22s cubic-bezier(.2,.8,.2,1)',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
