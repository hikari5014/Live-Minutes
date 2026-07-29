// Where the meeting audio comes from: the microphone, a browser tab
// (getDisplayMedia — for online meetings/livestreams), or both mixed together
// for hybrid meetings. Tab capture is desktop-Chromium only; iOS Safari has no
// getDisplayMedia at all, so the option is hidden there rather than failing.
export type AudioSourceKind = 'mic' | 'tab' | 'both'

export interface AcquiredAudio {
  stream: MediaStream
  /** Stops only what this module started. */
  cleanup: () => void
  usedTab: boolean
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isChromium(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // Chrome/Edge/Opera report Chrome; exclude Firefox and desktop Safari.
  return /Chrome|Chromium|Edg\//.test(ua) && !/Firefox/.test(ua)
}

function isCoarsePointerPhone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches === true && window.innerWidth < 900
}

/** Can this device capture tab/system audio? Desktop Chromium with the API. */
export function tabAudioSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') return false
  if (isIOS()) return false
  if (!isChromium()) return false
  return !isCoarsePointerPhone()
}

/** Why tab audio is unavailable, for the UI to explain instead of just hiding. */
export function tabAudioBlockedReason(): string | null {
  if (!tabAudioSupported()) {
    if (isIOS()) return 'iOS 不允許網頁讀取其他 App 或分頁的聲音（系統限制）。可改用喇叭外放＋麥克風收音。'
    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getDisplayMedia !== 'function')
      return '此瀏覽器不支援畫面／分頁擷取。'
    if (!isChromium()) return '分頁音訊擷取目前僅在桌機版 Chrome / Edge 穩定支援。'
    return '此裝置不支援分頁音訊擷取。'
  }
  return null
}

function micConstraints(echoCancel: boolean): MediaStreamConstraints {
  return {
    audio: { channelCount: 1, echoCancellation: echoCancel, noiseSuppression: echoCancel, autoGainControl: true },
    video: false,
  }
}

/** Acquire one shared stream for both the recorder and live ASR, so the tab
 *  picker only ever appears once per meeting. */
export async function acquireAudio(
  kind: AudioSourceKind,
  opts: { echoCancel: boolean; onTabEnded?: () => void },
): Promise<AcquiredAudio> {
  if (kind === 'mic' || !tabAudioSupported()) {
    const stream = await navigator.mediaDevices.getUserMedia(micConstraints(opts.echoCancel))
    return { stream, usedTab: false, cleanup: () => stream.getTracks().forEach((t) => t.stop()) }
  }

  // getDisplayMedia cannot be audio-only: we must request video, then keep the
  // track alive (stopping it ends the whole capture) but disabled so nothing is
  // rendered or encoded.
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  const displayAudio = display.getAudioTracks()
  if (displayAudio.length === 0) {
    display.getTracks().forEach((t) => t.stop())
    throw new Error('沒有取得分頁音訊，請在分享視窗中勾選「分享分頁音訊」')
  }
  display.getVideoTracks().forEach((t) => {
    t.enabled = false
    t.addEventListener('ended', () => opts.onTabEnded?.())
  })
  displayAudio.forEach((t) => t.addEventListener('ended', () => opts.onTabEnded?.()))

  if (kind === 'tab') {
    return {
      stream: new MediaStream(displayAudio),
      usedTab: true,
      cleanup: () => display.getTracks().forEach((t) => t.stop()),
    }
  }

  // 'both' — mix mic + tab into a single mono-ish track via Web Audio.
  const mic = await navigator.mediaDevices.getUserMedia(micConstraints(opts.echoCancel)).catch(() => null)
  if (!mic) {
    return {
      stream: new MediaStream(displayAudio),
      usedTab: true,
      cleanup: () => display.getTracks().forEach((t) => t.stop()),
    }
  }
  const AudioCtx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()
  const dest = ctx.createMediaStreamDestination()
  ctx.createMediaStreamSource(mic).connect(dest)
  ctx.createMediaStreamSource(new MediaStream(displayAudio)).connect(dest)
  return {
    stream: dest.stream,
    usedTab: true,
    cleanup: () => {
      display.getTracks().forEach((t) => t.stop())
      mic.getTracks().forEach((t) => t.stop())
      void ctx.close().catch(() => undefined)
    },
  }
}

export function sourceLabel(kind: AudioSourceKind): string {
  return kind === 'tab' ? '分頁音訊' : kind === 'both' ? '麥克風＋分頁音訊' : '麥克風'
}
