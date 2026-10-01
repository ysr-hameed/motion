import { useEffect, useRef, useState } from "react"
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion"
import { Timeline } from "./Timeline"
import { isMotionDoc } from "./schema-guard"
import { ensureDocFonts } from "@/lib/fonts"

/**
 * Validates a MotionDoc and renders it — or an honest error slate
 * when the document is malformed. This is the only component the
 * Player ever mounts.
 *
 * Layer type (Unbounded display default, or any explicit Google family)
 * is fetched before frame 0 is captured, so preview and export agree.
 * The 4s timeout means an offline session still renders — in a fallback
 * face — instead of hanging.
 */
export const ClipRenderer: React.FC<{ doc: unknown }> = ({ doc }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const [handle] = useState(() => delayRender("Loading clip fonts"))
  const released = useRef(false)
  useEffect(() => {
    let live = true
    const done = () => {
      if (live && !released.current) {
        released.current = true
        continueRender(handle)
      }
    }
    const t = setTimeout(done, 4000)
    void (async () => {
      try {
        if (isMotionDoc(doc)) {
          ensureDocFonts(doc as { layers?: { props?: { fontFamily?: unknown; font?: unknown } }[] })
        }
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
        if (fonts) await Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 3500))])
      } catch {
        /* fallback faces render instead of hanging */
      }
      done()
      clearTimeout(t)
    })()
    return () => {
      live = false
      clearTimeout(t)
      done()
    }
  }, [doc, handle])

  if (!isMotionDoc(doc)) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#09090b",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 24,
        }}
      >
        This version failed validation and was skipped.
      </div>
    )
  }

  return (
    <Timeline doc={doc} frame={frame} fps={fps} durationFrames={durationInFrames} />
  )
}
