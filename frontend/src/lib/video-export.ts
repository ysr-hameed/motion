/**
 * Bridge between the header Export menu and the ClipPlayer that owns the
 * canvas. The player subscribes to this event and renders the current
 * version to a real video file, reporting progress on its own overlay.
 */
export const EXPORT_VIDEO_EVENT = "motion:export-video"

export function requestVideoExport() {
  window.dispatchEvent(new Event(EXPORT_VIDEO_EVENT))
}
