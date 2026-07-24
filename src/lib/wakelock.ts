// Screen Wake Lock — keep the screen awake while recording.
// Re-acquires automatically when the tab returns to the foreground.

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> }

let sentinel: WakeLockSentinelLike | null = null
let active = false

async function acquire(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }
  if (!nav.wakeLock) return
  try {
    sentinel = await nav.wakeLock.request('screen')
  } catch {
    // Denied (e.g. low battery) — non-fatal.
  }
}

function onVisibility(): void {
  if (active && document.visibilityState === 'visible') void acquire()
}

export async function enableWakeLock(): Promise<void> {
  active = true
  document.addEventListener('visibilitychange', onVisibility)
  await acquire()
}

export async function disableWakeLock(): Promise<void> {
  active = false
  document.removeEventListener('visibilitychange', onVisibility)
  if (sentinel && !sentinel.released) {
    try {
      await sentinel.release()
    } catch {
      /* ignore */
    }
  }
  sentinel = null
}

export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator
}
