---
name: example-progress-bar
description: Loading bar animating 0 to 100 percent. Load for progress, loading, countdown, fundraising meters.
---

# Example: example-progress-bar

IMITATE the structure, timing, and easing — do not copy verbatim. When adapting to this player, ALL of the following are REQUIRED:
- fontFamily: use Fonts.*.family (e.g. Fonts.unbounded.family), never Inter/system fonts unless the user names them
- motion via scale / translate / rotate shorthands, never transform strings
- every interpolate() gets extrapolateLeft:"clamp", extrapolateRight:"clamp"
- end the file with a default export (export default <Component>); NEVER render <Composition> inside
- <Sequence> needs layout + premountFor; Series overlaps with offset={-15}

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const MyAnimation = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = interpolate(
    frame,
    [0, durationInFrames * 0.8],
    [0, 100],
    { extrapolateRight: "clamp" }
  );

  const opacity = interpolate(
    frame,
    [0, 20],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a1a",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div style={{ width: 600 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <span
            style={{
              color: "#fff",
              fontSize: 24,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Loading...
          </span>
          <span
            style={{
              color: "#10b981",
              fontSize: 24,
              fontWeight: "bold",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {Math.round(progress)}%
          </span>
        </div>
        <div
          style={{
            width: "100%",
            height: 24,
            backgroundColor: "#333",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "linear-gradient(90deg, #10b981, #34d399)",
              borderRadius: 12,
              transition: "width 0.1s ease-out",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
```
