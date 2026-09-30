import { useCurrentFrame, useVideoConfig } from "remotion"
import { Timeline } from "./Timeline"
import { isMotionDoc } from "./schema-guard"

/**
 * Validates a MotionDoc and renders it — or an honest error slate
 * when the document is malformed. This is the only component the
 * Player ever mounts.
 */
export const ClipRenderer: React.FC<{ doc: unknown }> = ({ doc }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

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
