import { Audio } from "remotion"
import type { LayerContext } from "./types"
import type { Layer } from "../motion-types"

/**
 * Soundtrack layer — no visuals. Plays from `offsetSecs` at `volume`.
 * Silent in muted previews; included in server renders.
 */
export function AudioLayer({ layer }: { layer: Layer; ctx: LayerContext }) {
  const p = layer.props ?? {}
  if (!p.src) return null
  return (
    <Audio
      src={p.src}
      volume={p.volume ?? 0.8}
      startFrom={Math.round((p.offsetSecs ?? 0) * 30)}
    />
  )
}
