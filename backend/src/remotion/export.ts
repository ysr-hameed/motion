/**
 * Phase 4 export & distribution (IMPLEMENTATION_PLAN.md §2.5).
 * Pure math + specs: preset dimensions, trim guidance, embed templates.
 * cdn_publish is honest about its state — R2 binding is not wired yet, so it
 * returns the exact config needed plus the URL/embed scheme, not a fake URL.
 */

export interface ExportPreset {
  id: string
  name: string
  width: number
  height: number
  fps: number
  maxSeconds: number
  format: string
  note: string
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: "ig-story", name: "Instagram Story", width: 1080, height: 1920, fps: 30, maxSeconds: 15, format: "MP4", note: "Vertical; hook in first 15 frames" },
  { id: "ig-feed", name: "Instagram Feed", width: 1080, height: 1080, fps: 30, maxSeconds: 60, format: "MP4", note: "Square; keep type ≥ safe margin" },
  { id: "ig-reel", name: "Instagram Reel", width: 1080, height: 1920, fps: 30, maxSeconds: 90, format: "MP4", note: "Vertical; captions on (most watch muted)" },
  { id: "tiktok", name: "TikTok", width: 1080, height: 1920, fps: 30, maxSeconds: 60, format: "MP4", note: "Vertical; resolve before the swipe" },
  { id: "youtube", name: "YouTube", width: 1920, height: 1080, fps: 30, maxSeconds: 0, format: "MP4", note: "Native canvas — no reframe needed" },
  { id: "twitter", name: "Twitter/X", width: 1280, height: 720, fps: 30, maxSeconds: 140, format: "MP4", note: "720p landscape" },
  { id: "linkedin", name: "LinkedIn", width: 1920, height: 1080, fps: 30, maxSeconds: 0, format: "MP4", note: "Native canvas; captions recommended" },
  { id: "web-hero", name: "Website Hero", width: 1920, height: 1080, fps: 30, maxSeconds: 0, format: "WebM", note: "WebM for size; poster frame for LCP" },
  { id: "png-seq", name: "Presentation (PNG seq)", width: 1920, height: 1080, fps: 30, maxSeconds: 0, format: "PNG sequence", note: "Frame-accurate; reassemble in editor" },
]

export function exportPreset(
  presetId: string,
  totalFrames: number,
  fps = 30
): { ok: boolean; spec?: object; error?: string } {
  const p = EXPORT_PRESETS.find((x) => x.id === presetId)
  if (!p) return { ok: false, error: `Unknown preset "${presetId}". Available: ${EXPORT_PRESETS.map((x) => x.id).join(", ")}` }
  const seconds = Math.round((totalFrames / fps) * 10) / 10
  const reframe =
    p.width === 1920 && p.height === 1080
      ? "Native canvas — no reframe."
      : `REFRAME REQUIRED: canvas is 1920×1080, target is ${p.width}×${p.height}. Center-crop the safe region (scale ${Math.max(p.width / 1920, p.height / 1080).toFixed(2)}×, anchor on the focal element) — do not stretch.`
  return {
    ok: true,
    spec: {
      preset: p.name,
      dimensions: `${p.width}×${p.height}`,
      fps: p.fps,
      duration: `${seconds}s (${totalFrames}f)`,
      format: p.format,
      withinLimit: p.maxSeconds === 0 || seconds <= p.maxSeconds,
      limitNote: p.maxSeconds === 0 ? "No platform cap" : seconds <= p.maxSeconds ? `Under the ${p.maxSeconds}s cap` : `OVER the ${p.maxSeconds}s cap by ${Math.round(seconds - p.maxSeconds)}s — trim first`,
      reframe,
      note: p.note,
    },
  }
}

export function exportBundle(totalFrames: number): { presets: string[]; estimate: string } {
  return {
    presets: EXPORT_PRESETS.map((p) => p.id),
    estimate: `9 renders for ${Math.round(totalFrames / 30)}s of motion. Render the native 1920×1080 master once, then reframe per preset — never re-animate per platform.`,
  }
}

export function cdnPublish(title: string): {
  status: string
  urlScheme: string
  embed: string
  wranglerNeeded: string
} {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cut"
  return {
    status: "pending-r2-binding — no file was uploaded",
    urlScheme: `https://cdn.slyxup.com/m/<composition-id>/${slug}-<preset>.mp4`,
    embed: `<video src="https://cdn.slyxup.com/m/<composition-id>/${slug}-youtube.mp4" controls playsinline style="max-width:100%"></video>`,
    wranglerNeeded:
      `Add to backend/wrangler.jsonc: "r2_buckets": [{ "binding": "CUTS", "bucket_name": "slyxup-motion-cuts" }], ` +
      `then PUT <rendered-bytes> to CUTS with key m/<composition-id>/${slug}-<preset>.mp4 and return the public URL.`,
  }
}

export function thumbnailSpec(frame: number, totalFrames: number): { frame: number; note: string } {
  const f = Math.min(totalFrames - 1, Math.max(0, Math.round(frame)))
  return {
    frame: f,
    note: `Capture frame ${f} from the Player (canvas.toDataURL on the real render, not a mock). Variations: ${f}, ${Math.min(totalFrames - 1, f + 30)}, ${Math.max(0, f - 30)} — pick the one where the hero element is settled.`,
  }
}

export function watermarkSpec(position = "bottom-right"): { snippet: string; note: string } {
  const pos: Record<string, string> = {
    "bottom-right": "right: 96, bottom: 96",
    "bottom-left": "left: 96, bottom: 96",
    "top-right": "right: 96, top: 96",
    "top-left": "left: 96, top: 96",
  }
  return {
    snippet: `<div class="watermark">SLYXUP</div>\n.watermark{position:absolute;${pos[position] ?? pos["bottom-right"]};font-size:22px;letter-spacing:4px;opacity:.7;z-index:40}`,
    note: `96px safe-margin respected. Opacity 0.7 max — visible without stealing the frame. Free-tier exports keep it; Pro removes it.`,
  }
}
