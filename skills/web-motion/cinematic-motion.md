---
name: cinematic-motion
description: Film-grade aliveness from Disney's 12 principles — anticipation, overshoot, secondary motion, breathing, parallax, light. Load for aliveness.
---

# Cinematic motion

The difference between software animation and film is what happens AROUND the main move. Layer at least three of these in every cut.

## 1. Anticipation (Disney #2)

Dip opposite first: scale 1→0.94 over 4–12f with easeIn, THEN the entrance. A jump starts with bent knees; a punch starts with a pulled-back fist. No anticipation = no weight. Wind-up under 4f is invisible; over 15f is hesitation.

## 2. Overshoot settle (slow in/out + follow-through)

Springs that ring past 1.0 and settle (see `spring`). Damping 10–14 playful, 15–20 confident, 24–30 prestige. Follow-through: nothing stops all at once — hero lands, sub lands 4f later, badge drifts opposite, decor keeps parallaxing.

## 3. Secondary action (Disney #8)

Gestures that SUPPORT the main action without dominating it: accent bar wipes as the hero lands, badge counter-drifts, glow blob parallaxes, progress hairline fills. Secondary action must never cover the primary — stage it below/behind, smaller, dimmer.

## 4. Idle breathing (the hold stays alive)

After the settle frame: `Math.sin(t * 2.4) * 2–4px` on the settled translate + counter-drift on the badge. A 120f+ cut with no drift reads as paused footage. Deterministic sine — identical every scrub.

## 5. Parallax depth

Background 20%, mid 60%, foreground 100% of travel (see `effects`). One Z-space move minimum per cut. Counter-motion (secondary moves opposite primary) is parallax's cheaper cousin.

## 6. Light play + staging (Disney #3)

Glow drift behind the hero, vignette grounding the edges. Staging = the presentation of an idea so it is COMPLETELY and unmistakably clear: one focal element, light and placement aimed at it, everything else supporting.

## 7. Exaggeration with taste (Disney #9)

Push the idea past reality, then pull back 10%. Anticipation deeper, overshoot higher, stagger wider — then check the audit. Caricature of the motion, not of physics.

## The stack, in render order

Anticipation dip → spring overshoot landing → secondary motion → idle breathing + parallax + light. Six layers, one `render()`, all pure functions of `t`.
