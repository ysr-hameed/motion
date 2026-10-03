/**
 * Phase 4 smart export presets (IMPLEMENTATION_PLAN.md §4.5).
 * Mirrors backend/src/remotion/export.ts ids — the agent owns the render
 * math, this file drives the picker UI.
 */

export interface ExportPresetMeta {
  id: string
  name: string
  dims: string
  format: string
}

export const EXPORT_PRESETS: ExportPresetMeta[] = [
  { id: "ig-story", name: "Instagram Story", dims: "1080×1920", format: "MP4" },
  { id: "ig-feed", name: "Instagram Feed", dims: "1080×1080", format: "MP4" },
  { id: "ig-reel", name: "Instagram Reel", dims: "1080×1920", format: "MP4" },
  { id: "tiktok", name: "TikTok", dims: "1080×1920", format: "MP4" },
  { id: "youtube", name: "YouTube", dims: "1920×1080", format: "MP4" },
  { id: "twitter", name: "Twitter/X", dims: "1280×720", format: "MP4" },
  { id: "linkedin", name: "LinkedIn", dims: "1920×1080", format: "MP4" },
  { id: "web-hero", name: "Website Hero", dims: "1920×1080", format: "WebM" },
  { id: "png-seq", name: "Presentation", dims: "1920×1080", format: "PNG seq" },
]

export const EXPORT_EVENT = "motion:export"

export function openExport() {
  window.dispatchEvent(new CustomEvent(EXPORT_EVENT))
}
