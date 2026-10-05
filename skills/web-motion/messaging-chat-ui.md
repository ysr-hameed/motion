---
name: messaging-chat-ui
description: Chat/testimonial cuts — bubble cascade, typing indicator, read ticks, phone frame. Load for conversation briefs.
---

# Messaging & chat UI

## Bubble cascade

Bubbles arrive with per-message springs, stagger 8–12f (reading pace, not machine-gun):

```js
// init(): bubbles in order. render(), per bubble i:
var d = startF + i * 10;
var s = ctx.spring(t - d / 30, { damping: 18, mass: 0.6, stiffness: 160 });
bubble.style.translate = "0 " + ctx.interpolate(f, [d, d + 14], [26, 0], { easing: ctx.Easing.easeOut }) + "px";
bubble.style.opacity = Math.max(0, Math.min(1, s));
bubble.style.scale = String(0.9 + Math.max(0, s) * 0.1); // pop from the sender side
```

Inbound left / outbound right, brand accent for outbound. transform-origin on the sender edge so pops lean correctly.

## Typing indicator (precedes each inbound bubble)

Three dots, sine phase offsets, deterministic:

```js
dot.style.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 6 + i * 1.1));
// Visible window: [bubbleStart - 24f, bubbleStart), then the bubble replaces it.
```

## Read ticks + timestamps

Double-tick turns accent when `f` passes the read frame. Timestamps small mono (`Space Mono` 20–24px), dimmed, below each group — not each bubble.

## Phone frame (optional)

Rounded-rect chrome (notch optional, keep it abstract), bubbles inside with its own padding. The frame is decor (z low, static-ish with breathing); bubbles are content.

## Testimonials = chat without the phone

Quote cascades word-by-word (see `kinetic-typography`), name/role as a mini lower-third WITH exit, star row popping staggered. Same timing grammar, different chrome.

## Rules

- ✅ Reading pace (8–12f stagger). ✅ Typing dots before inbound. ✅ Latest bubble never under the badge — scroll the stack (translate the column) as it grows.
- ❌ All bubbles at once. ❌ Wall-clock typing loops. ❌ Real message data — placeholder copy, clearly so.
