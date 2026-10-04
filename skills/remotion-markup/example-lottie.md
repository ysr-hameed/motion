---
name: example-lottie
description: Loading and displaying a Lottie animation from URL. Load when the brief hands you a Lottie file or wants vector-character motion.
---

# Example: example-lottie

IMITATE the structure, timing, and easing — do not copy verbatim. When adapting to this player, ALL of the following are REQUIRED:
- fontFamily: use Fonts.*.family (e.g. Fonts.unbounded.family), never Inter/system fonts unless the user names them
- motion via scale / translate / rotate shorthands, never transform strings
- every interpolate() gets extrapolateLeft:"clamp", extrapolateRight:"clamp"
- end the file with a default export (export default <Component>); NEVER render <Composition> inside
- <Sequence> needs layout + premountFor; Series overlaps with offset={-15}

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Lottie } from "@remotion/lottie";
import { useState, useEffect } from "react";

export const MyAnimation = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [animationData, setAnimationData] = useState(null);

  useEffect(() => {
    fetch("https://assets-v2.lottiefiles.com/a/73ecc94a-4ccb-4018-a710-835b9eaffeaf/OwGeQT8PCr.json")
      .then((res) => res.json())
      .then((data) => setAnimationData(data))
      .catch((err) => console.error("Failed to load Lottie:", err));
  }, []);

  const entrance = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  const scale = interpolate(entrance, [0, 1], [0.5, 1]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);

  if (!animationData) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#000000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#94a3b8", fontSize: 24, fontFamily: "system-ui" }}>
          Loading animation...
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
        }}
      >
        <Lottie
          animationData={animationData}
          style={{ width: 400, height: 400 }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 60,
          color: "#e2e8f0",
          fontSize: 24,
          fontFamily: "system-ui",
          opacity,
          textAlign: "center",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Glowing Fish Loader</div>
        <div style={{ fontSize: 16, color: "#94a3b8" }}>by Mau Ali on LottieFiles</div>
      </div>
    </AbsoluteFill>
  );
};
```
