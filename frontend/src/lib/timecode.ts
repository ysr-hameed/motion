/** Frames → SMPTE-style timecode. The display language of the whole tool. */
export function timecode(frame: number, fps: number): string {
  const f = Math.max(0, Math.floor(frame))
  const totalSeconds = Math.floor(f / fps)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0")
  const ss = String(totalSeconds % 60).padStart(2, "0")
  const ff = String(f % fps).padStart(2, "0")
  return `${mm}:${ss}:${ff}`
}

export function seconds(frame: number, fps: number): string {
  return `${(Math.max(0, frame) / fps).toFixed(1)}s`
}
