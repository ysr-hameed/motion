---
name: messaging-chat-ui
description: Realistic chat/messaging UI: bubble alignment, staggered entrances, spring pop-in, WhatsApp/iMessage palettes. Load when the brief shows a conversation, DMs, comments, or testimonials.
---

# Messaging & chat UI

Chat that appears all at once reads as a screenshot. Chat that arrives
message-by-message with slide + fade + a spring pop reads as a conversation.

Player scope: `translate` / `scale` shorthands, clamps on every
`interpolate()`, `Fonts.*` families, one flex column (never sibling absolutes
sharing coordinates).

## Bubble layout — sent right, received left

Wrong (all bubbles centered):

```tsx
<div style={{ textAlign: "center" }}>
  {messages.map((m) => <div>{m.text}</div>)}
</div>
```

Right (flex column, per-row justification):

```tsx
<div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 60 }}>
  {messages.map((m, i) => (
    <div key={i} style={{ display: "flex", justifyContent: m.sent ? "flex-end" : "flex-start", marginTop: 18 }}>
      <div style={{
        maxWidth: "68%", padding: "18px 26px", borderRadius: 28,
        backgroundColor: m.sent ? COLOR_SENT : COLOR_RECEIVED,
        color: m.sent ? COLOR_TEXT_SENT : COLOR_TEXT_RECEIVED,
        fontSize: 34, fontFamily: Fonts.manrope.family, lineHeight: 1.35,
      }}>{m.text}</div>
    </div>
  ))}
</div>
```

## Staggered entrances — slide + fade per message

Wrong (all messages appear at once):

```tsx
{messages.map((m) => <Bubble text={m.text} />)}
```

Right (38f apart, each slides from its own side):

```tsx
const STAGGER = 38, FADE = 18;
{messages.map((m, i) => {
  const start = BASE + i * STAGGER;
  const opacity = interpolate(frame, [start, start + FADE], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const x = interpolate(opacity, [0, 1], [m.sent ? 60 : -60, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return <div style={{ opacity, translate: x + "px 0" }}>{/* bubble */}</div>;
})}
```

## Spring pop on entrance

Layer a small overshoot over the slide so bubbles land instead of stopping:

```tsx
const pop = spring({ frame: frame - start, fps, config: { damping: 12, stiffness: 170 } });
const popScale = interpolate(pop, [0, 1], [0.96, 1], {
  extrapolateLeft: "clamp", extrapolateRight: "clamp",
});
// style: {{ opacity, translate: x + "px 0", scale: popScale }}
// transformOrigin: m.sent ? "100% 100%" : "0% 100%"
```

## Palettes — pick one, commit

WhatsApp dark: bg `#0b141a`, sent `#1f8a70`, received `#202c33`, text `#e9edef`.
iMessage light: bg `#ffffff`, sent `#007AFF`, received `#E9E9EB`, sent-text
`#ffffff`, received-text `#000000`.

Typing indicator: three dots pulsing with `Math.sin` offsets 0/8/16f, shown
one STAGGER before the next bubble. Read receipts / timestamps resolve last
and hold — the eye lands where motion stops.
