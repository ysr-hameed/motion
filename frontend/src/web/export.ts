/**
 * Client-side export — no server render, no Remotion Lambda.
 *
 * Two passes, zero dependencies:
 *  1. Step the bundle deterministically (t = f/fps) in a hidden iframe and
 *     collect one SVG foreignObject snapshot per frame. Strings are small
 *     enough to hold (~hundreds of KB each); bitmaps are not.
 *  2. Play the snapshots back onto a canvas in realtime while a
 *     MediaRecorder captures the canvas stream → WebM (VP9/VP8) or MP4
 *     (where the browser supports an mp4 mime, i.e. Chromium).
 *
 * Honest limits, shown in the dialog: external images that refuse CORS may
 * not paint in snapshots (canvas taint rules for foreignObject), and Google
 * Fonts fall back in snapshots if the stylesheet has not resolved — the
 * preview (live DOM) is always the richer render.
 */

import { buildSrcdoc, helloFamilies } from "./runtime"
import type { WebBundle } from "./types"

export interface ExportProgress {
  /** 0..1 across both passes. */
  p: number
  phase: "render" | "encode"
}

export interface ExportResult {
  blob: Blob
  ext: "webm" | "mp4"
  mime: string
  frames: number
  fps: number
}

function pickMime(want: "webm" | "mp4"): { mime: string; ext: "webm" | "mp4" } {
  const MR = window.MediaRecorder
  if (want === "mp4") {
    for (const m of ["video/mp4", 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"']) {
      try {
        if (MR?.isTypeSupported(m)) return { mime: m, ext: "mp4" }
      } catch { /* ignore */ }
    }
  }
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', "video/webm"]) {
    try {
      if (MR?.isTypeSupported(m)) return { mime: m, ext: "webm" }
    } catch { /* ignore */ }
  }
  return { mime: "", ext: "webm" }
}

interface IframeMsg {
  ns?: string
  ev?: string
  cmd?: string
  id?: number
  ok?: boolean
  phase?: string
  svg?: string
  error?: string
  t?: number
  frame?: number
}

/**
 * Renders every frame snapshot. Resolves with SVG data-URL strings.
 * Throws on abort, timeout, or a render failure inside the iframe.
 */
async function renderSnapshots(
  bundle: WebBundle,
  fps: number,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const { width: W, height: H, duration } = bundle.meta
  const frames = Math.max(1, Math.round(duration * fps))
  const iframe = document.createElement("iframe")
  iframe.setAttribute("sandbox", "allow-scripts")
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;border:0;visibility:hidden;`
  iframe.srcdoc = buildSrcdoc(bundle)
  document.body.appendChild(iframe)
  const win = iframe.contentWindow

  const pending = new Map<number, (m: IframeMsg) => void>()
  let seq = 1
  let settled = false
  let mountOk = false
  let mountErr: string | null = null
  let notifyReady: (() => void) | null = null

  const onMsg = (e: MessageEvent) => {
    if (e.source !== win) return
    const m = (e.data ?? {}) as IframeMsg
    if (m.ns !== "wm") return
    if (m.ev === "report" && (m.phase === "mount" || m.phase === "compile")) {
      if (m.phase === "mount" && m.ok) {
        mountOk = true
        notifyReady?.()
      } else if (m.phase === "compile" && m.ok === false && !mountOk) {
        mountErr = typeof m.error === "string" ? m.error : "bundle failed to evaluate"
        notifyReady?.()
      }
      return
    }
    if (m.ev === "export-frame" && typeof m.id === "number") {
      const fn = pending.get(m.id)
      if (fn) {
        pending.delete(m.id)
        fn(m)
      }
    }
  }
  window.addEventListener("message", onMsg)

  const cleanup = () => {
    if (settled) return
    settled = true
    window.removeEventListener("message", onMsg)
    iframe.remove()
  }

  try {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError")
    // Boot handshake: wait for load, say hello (font truth), wait for mount.
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("export iframe did not boot (8s)")), 8000)
      const onAbort = () => {
        clearTimeout(to)
        reject(new DOMException("aborted", "AbortError"))
      }
      signal?.addEventListener("abort", onAbort, { once: true })
      notifyReady = () => {
        clearTimeout(to)
        signal?.removeEventListener("abort", onAbort)
        if (mountErr) reject(new Error(mountErr))
        else resolve()
      }
      iframe.onload = () => {
        try {
          win?.postMessage({ ns: "wm", cmd: "hello", families: helloFamilies(bundle) }, "*")
        } catch (err) {
          clearTimeout(to)
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
      // srcdoc iframes fire load reliably; the 8s timeout is the backstop.
      setTimeout(() => {
        if (!mountOk && !mountErr) {
          try {
            win?.postMessage({ ns: "wm", cmd: "hello", families: helloFamilies(bundle) }, "*")
          } catch { /* ignore */ }
        }
      }, 2500)
    })

    const urls: string[] = []
    for (let f = 0; f < frames; f++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError")
      const t = Math.min(duration, f / fps)
      const id = seq++
      const svg: string = await new Promise((resolve, reject) => {
        const to = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`frame ${f} snapshot timed out`))
        }, 8000)
        pending.set(id, (m) => {
          clearTimeout(to)
          if (m.error || !m.svg) reject(new Error(m.error ?? `frame ${f} failed to snapshot`))
          else resolve(m.svg)
        })
        win?.postMessage({ ns: "wm", cmd: "export-frame", t, id }, "*")
      })
      urls.push("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg))
      onProgress(urls.length / frames)
    }
    return urls
  } finally {
    cleanup()
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = "sync"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("snapshot image failed to decode"))
    img.src = url
  })
  return img
}

/** Plays snapshots onto a canvas in realtime while recording the stream. */
async function recordRealtime(
  urls: string[],
  W: number,
  H: number,
  fps: number,
  mime: string,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2d canvas unavailable")
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, W, H)

  const stream = canvas.captureStream(fps)
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined)
  const chunks: BlobPart[] = []
  const done = new Promise<void>((resolve, reject) => {
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = () => resolve()
    rec.onerror = () => reject(new Error("recorder failed"))
  })
  rec.start(250)

  const stepMs = 1000 / fps
  try {
    for (let i = 0; i < urls.length; i++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError")
      const started = performance.now()
      try {
        const img = await loadImage(urls[i]!)
        ctx.drawImage(img, 0, 0, W, H)
      } catch {
        // A frame that will not decode holds the previous one — the cut
        // stays in sync rather than aborting the whole export.
      }
      onProgress(i / urls.length)
      const wait = stepMs - (performance.now() - started)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
    // Tail hold so the last frame is not clipped by the muxer.
    await new Promise((r) => setTimeout(r, 400))
  } finally {
    if (rec.state !== "inactive") rec.stop()
    for (const t of stream.getTracks()) t.stop()
  }
  await done
  return new Blob(chunks, { type: mime || "video/webm" })
}

export async function exportBundleToVideo(
  bundle: WebBundle,
  opts: {
    fps?: number
    format?: "webm" | "mp4"
    signal?: AbortSignal
    onProgress?: (p: ExportProgress) => void
  } = {},
): Promise<ExportResult> {
  const fps = opts.format === undefined ? (opts.fps ?? bundle.meta.fps) : (opts.fps ?? 30)
  const { mime, ext } = pickMime(opts.format ?? "webm")
  const frames = Math.max(1, Math.round(bundle.meta.duration * fps))
  const urls = await renderSnapshots(
    bundle,
    fps,
    (p) => opts.onProgress?.({ p: p * 0.7, phase: "render" }),
    opts.signal,
  )
  const blob = await recordRealtime(
    urls,
    bundle.meta.width,
    bundle.meta.height,
    fps,
    mime,
    (p) => opts.onProgress?.({ p: 0.7 + p * 0.3, phase: "encode" }),
    opts.signal,
  )
  return { blob, ext, mime: blob.type || mime, frames, fps }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
