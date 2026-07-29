// Storage quota helpers. Browser storage is evictable under disk pressure, so
// we ask for persistence and surface the real numbers to the user.

export interface StorageInfo {
  usage: number
  quota: number
  persisted: boolean
  supported: boolean
}

export async function storageInfo(): Promise<StorageInfo> {
  const s = navigator.storage
  if (!s?.estimate) return { usage: 0, quota: 0, persisted: false, supported: false }
  const est = await s.estimate().catch(() => ({}) as StorageEstimate)
  let persisted = false
  try {
    persisted = (await s.persisted?.()) ?? false
  } catch {
    persisted = false
  }
  return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted, supported: true }
}

/** Ask the browser to keep our data. Chrome grants by engagement/installed
 *  state; Safari behaviour varies, so treat a false result as non-fatal. */
export async function requestPersist(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export function formatBytes(n: number): string {
  if (!n) return '0 MB'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
