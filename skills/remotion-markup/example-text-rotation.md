---
name: example-text-rotation
description: Rotating words with fade and blur transitions. Load for word carousels, rotating headlines, role/ticker text.
---

# Example: example-text-rotation

IMITATE the structure, timing, and easing — do not copy verbatim. When adapting to this player, ALL of the following are REQUIRED:
- fontFamily: use Fonts.*.family (e.g. Fonts.unbounded.family), never Inter/system fonts unless the user names them
- motion via scale / translate / rotate shorthands, never transform strings
- every interpolate() gets extrapolateLeft:"clamp", extrapolateRight:"clamp"
- end the file with a default export (export default <Component>); NEVER render <Composition> inside
- <Sequence> needs layout + premountFor; Series overlaps with offset={-15}

```tsx
import { useCurrentFrame, AbsoluteFill, interpolate } from "remotion";

export const MyAnimation = () => {
  const frame = useCurrentFrame();

  // Text content - easily customizable
  const WORDS = ["This is a", "Text rotation example", "using Remotion!"];

  // Animation timing
  const WORD_DURATION = 60; // frames per word
  const FADE_IN_DURATION = 15;
  const FADE_OUT_START = 45;

  // Visual styling
  const FONT_SIZE = 120;
  const FONT_WEIGHT = "bold";
  const COLOR_TEXT = "#eee";
  const COLOR_BACKGROUND = "#1a1a2e";
  const BLUR_AMOUNT = 10;

  const currentWordIndex = Math.floor(frame / WORD_DURATION) % WORDS.length;
  const frameInWord = frame % WORD_DURATION;

  // Fade in/out animation
  const opacity = interpolate(
    frameInWord,
    [0, FADE_IN_DURATION, FADE_OUT_START, WORD_DURATION],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp" }
  );

  // Scale animation
  const scale = interpolate(
    frameInWord,
    [0, FADE_IN_DURATION, FADE_OUT_START, WORD_DURATION],
    [0.8, 1, 1, 1.2],
    { extrapolateRight: "clamp" }
  );

  // Blur animation
  const blur = interpolate(
    frameInWord,
    [0, FADE_IN_DURATION, FADE_OUT_START, WORD_DURATION],
    [BLUR_AMOUNT, 0, 0, BLUR_AMOUNT],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLOR_BACKGROUND,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <h1
        style={{
          fontSize: FONT_SIZE,
          fontWeight: FONT_WEIGHT,
          color: COLOR_TEXT,
          opacity,
          transform: `scale(${scale})`,
          filter: `blur(${blur}px)`,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {WORDS[currentWordIndex]}
      </h1>
    </AbsoluteFill>
  );
};
```
