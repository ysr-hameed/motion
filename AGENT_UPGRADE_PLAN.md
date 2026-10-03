# SlyxUp Motion Agent: Advanced Motion Design Upgrade Plan

**Goal:** Transform the agent from a basic animation generator into an advanced motion design system that produces professional, polished compositions without overflow, overlay issues, or broken code.

---

## Executive Summary

The current agent works but produces **basic, linear animations** that lack professional motion design principles. This plan upgrades it to create **advanced, organic motion** with proper physics, timing, hierarchy, and spatial awareness while ensuring **zero code failures** through enhanced validation and self-correction.

### Critical Problems to Solve

1. **Basic animation quality** — linear timing, single-property fades, no anticipation/settle
2. **Layout overflow/overlay issues** — text/elements escaping canvas or overlapping unintentionally
3. **Code validation failures** — invalid code reaching the user, requiring manual fixes
4. **No spatial reasoning** — 2D stacking without depth, z-index conflicts, collision detection
5. **Missing professional polish** — no easing curves library, no spring presets, basic typography

---

## Phase 1: Enhanced Validation & Self-Correction

**Objective:** Ensure the agent NEVER outputs broken or invalid code.

### 1.1 Pre-Generation Validation Layer

**File:** `backend/src/remotion/validate.ts` (extend existing)

**New Checks:**
```typescript
// Add to checkComposition():

// Layout & Spatial Checks
- Absolute positioning overflow (left/top/right/bottom > canvas bounds)
- z-index conflicts (multiple elements at same z-index with overlapping bounds)
- Font size vs line height mismatch (lineHeight < 1.0 for display type)
- Margin collapse causing unintended overlaps
- translateX/Y pushing elements off-canvas (static analysis of interpolate ranges)
- Scale transformations causing overflow (scale > 1.5 on elements near edges)

// Advanced Code Quality
- Missing frame variable in animated components
- Hardcoded frame numbers instead of useVideoConfig()
- Non-deterministic Date.now() or performance.now()
- Event listeners (onClick, onHover) in compositions
- Async operations without continueRender/delayRender pairs
- Missing cleanup in useEffect hooks
- Refs used incorrectly in frame-based rendering

// Motion Quality Heuristics  
- All interpolate() calls use linear (no easing)
- No spring() in entire composition
- Opacity-only animations (no transform properties)
- No stagger in mapped arrays
- Transitions under 15 frames (too fast to perceive)
- No overlap between sequences (each waits for previous)
```

### 1.2 Auto-Fix with Confidence Scoring

**New Tool:** `auto_fix_advanced`

```typescript
interface Fix {
  issue: string
  fix: string
  confidence: 'high' | 'medium' | 'low'
  preview: { before: string; after: string }
}

// High-confidence fixes (apply automatically):
- Math.random() → random(seed)
- Missing default export → add it
- system-ui font → Fonts.Inter.family
- Linear curves → Easing.bezier() based on motion type
- Missing frame variable → inject useCurrentFrame()

// Medium-confidence (suggest, require approval):
- Overlap detection → adjust z-index or timing
- Overflow detection → scale down or reposition
- Missing spring → add to appropriate elements

// Low-confidence (report only, explain options):
- Complex timing issues
- Unclear hierarchy problems
```

### 1.3 Validation Workflow Enhancement

**Change the agent workflow:**

```
Before: load_skill → plan → write → validate → fix manually → preview
After:  load_skill → plan → pre_validate_plan → write → 
        auto_validate → auto_fix (loop max 2x) → 
        verify_no_errors → preview
```

**Key:** Agent NEVER moves to preview unless `validate_composition` returns `ok: true, errors: []`

---

## Phase 2: Advanced Motion Design System

**Objective:** Build a motion design library that makes professional animation the default.

### 2.1 Easing & Timing Library

**New File:** `backend/src/remotion/motion-library.ts`

```typescript
export const MotionPresets = {
  // Entrances
  heroEntrance: {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    duration: 60, // frames
    transform: 'translateY(40) + scale(0.95) → 0',
    spring: { damping: 18, mass: 0.8, stiffness: 120 }
  },
  
  punchIn: {
    easing: Easing.bezier(0.8, 0, 0.2, 1),
    duration: 24,
    transform: 'scale(0.8) + opacity(0) → scale(1) + opacity(1)',
    overshoot: 1.08 // peaks at 108%, settles to 100%
  },
  
  slideReveal: {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    duration: 45,
    mask: 'clipPath from 0 to 100%',
    transform: 'translateX(-30)'
  },

  // Transitions between beats
  seamlessHandoff: {
    overlap: 15, // frames of crossfade
    outEasing: Easing.bezier(0.4, 0, 1, 1),
    inEasing: Easing.bezier(0, 0, 0.2, 1),
    stagger: 3 // offset per layer
  },

  // Settles & Exits
  elasticSettle: {
    spring: { damping: 15, mass: 1.2, stiffness: 100 },
    overshoot: 1.12,
    settleTime: 40
  },
  
  fadeToBlack: {
    duration: 30,
    easing: Easing.bezier(0.4, 0, 1, 1),
    holdFrames: 10 // hold at 0 opacity before cut
  }
}

// Preset combinations for common patterns
export const MotionPatterns = {
  productReveal: [
    { beat: 'anticipation', preset: 'heroEntrance', delay: 0 },
    { beat: 'reveal', preset: 'punchIn', delay: 60 },
    { beat: 'settle', preset: 'elasticSettle', delay: 84 }
  ],
  
  textSequence: [
    { beat: 'kicker', preset: 'slideReveal', delay: 0 },
    { beat: 'headline', preset: 'heroEntrance', delay: 20 },
    { beat: 'subhead', preset: 'slideReveal', delay: 45 }
  ]
}
```

**Integration:**
- Add `load_motion_preset` tool
- Auto-suggest presets based on beat descriptions in `plan_motion`
- Validate preset compatibility with composition timing

### 2.2 Spring Physics System

**Enhance existing spring usage:**

```typescript
// Add spring preset library
export const SpringPresets = {
  snappy: { damping: 18, mass: 0.5, stiffness: 180 },
  bouncy: { damping: 12, mass: 1.0, stiffness: 120 },
  smooth: { damping: 22, mass: 0.8, stiffness: 100 },
  gentle: { damping: 26, mass: 1.2, stiffness: 80 },
  dramatic: { damping: 10, mass: 1.5, stiffness: 140 }
}

// Multi-stage spring animations
export function cascadeSpring(elements: number, baseDelay: number) {
  return elements.map((_, i) => ({
    delay: baseDelay + (i * 3), // 3-frame stagger
    spring: SpringPresets.snappy
  }))
}
```

### 2.3 Layout & Spatial Reasoning

**New File:** `backend/src/remotion/layout-engine.ts`

```typescript
interface Element {
  id: string
  bounds: { x: number; y: number; width: number; height: number }
  zIndex: number
  type: 'text' | 'image' | 'shape' | 'video'
}

interface LayoutPlan {
  elements: Element[]
  conflicts: Array<{ 
    type: 'overflow' | 'overlap' | 'z-conflict',
    elements: string[],
    fix: string 
  }>
  safeZones: { title: Rect, body: Rect, margin: number }
}

export class LayoutEngine {
  private canvas = { width: 1920, height: 1080 }
  private safeMargin = 60
  
  // Detect overflow BEFORE code generation
  detectOverflow(element: Element): boolean {
    return (
      element.bounds.x < this.safeMargin ||
      element.bounds.y < this.safeMargin ||
      element.bounds.x + element.bounds.width > this.canvas.width - this.safeMargin ||
      element.bounds.y + element.bounds.height > this.canvas.height - this.safeMargin
    )
  }
  
  // Detect unintentional overlaps
  detectOverlap(e1: Element, e2: Element): boolean {
    // Elements at different z-index are intentional
    if (Math.abs(e1.zIndex - e2.zIndex) > 1) return false
    
    return !(
      e1.bounds.x + e1.bounds.width < e2.bounds.x ||
      e2.bounds.x + e2.bounds.width < e1.bounds.x ||
      e1.bounds.y + e1.bounds.height < e2.bounds.y ||
      e2.bounds.y + e2.bounds.height < e1.bounds.y
    )
  }
  
  // Auto-arrange elements to avoid conflicts
  autoLayout(elements: Element[], strategy: 'stack' | 'grid' | 'hierarchy'): Element[] {
    switch(strategy) {
      case 'hierarchy':
        return this.hierarchyLayout(elements)
      case 'grid':
        return this.gridLayout(elements)
      default:
        return this.stackLayout(elements)
    }
  }
  
  private hierarchyLayout(elements: Element[]): Element[] {
    // Title zone: top 30%
    // Body zone: middle 50%  
    // CTA zone: bottom 20%
    // Auto-position based on element type
    const zones = {
      title: { y: 120, height: 324 },
      body: { y: 444, height: 540 },
      cta: { y: 984, height: 216 }
    }
    
    return elements.map(el => {
      if (el.type === 'text' && el.bounds.height > 100) {
        // Large text = title
        return { ...el, bounds: { ...el.bounds, y: zones.title.y }}
      }
      // ... smart positioning logic
      return el
    })
  }
}
```

**New Tool:** `layout_plan`

```typescript
layout_plan: tool({
  description: "Plan element layout BEFORE writing code. Returns positioned elements " +
               "with conflict detection and auto-fix suggestions.",
  inputSchema: z.object({
    elements: z.array(z.object({
      id: z.string(),
      type: z.enum(['text', 'image', 'shape', 'video']),
      approximate_size: z.object({ width: z.number(), height: z.number() })
    })),
    strategy: z.enum(['hierarchy', 'grid', 'stack']).default('hierarchy')
  }),
  execute: async ({ elements, strategy }) => {
    const engine = new LayoutEngine()
    const planned = engine.autoLayout(elements, strategy)
    const conflicts = engine.detectConflicts(planned)
    
    return { 
      layout: planned, 
      conflicts,
      code_hints: planned.map(el => 
        `<div style={{ position: 'absolute', left: ${el.bounds.x}, top: ${el.bounds.y}, ... }}>`
      )
    }
  }
})
```

### 2.4 Advanced Typography Engine

**Enhance existing type system:**

```typescript
// Add to backend/src/remotion/type.ts

export const TypographyPresets = {
  heroLockup: {
    kicker: { size: 28, tracking: 0.15, uppercase: true, opacity: 0.7 },
    headline: { size: 140, tracking: -0.02, lineHeight: 0.95, weight: 700 },
    subhead: { size: 48, tracking: 0, lineHeight: 1.3, weight: 400 }
  },
  
  editorial: {
    headline: { size: 120, tracking: -0.01, lineHeight: 1.0, weight: 500 },
    body: { size: 40, tracking: 0.01, lineHeight: 1.5, weight: 400 },
    caption: { size: 28, tracking: 0.05, lineHeight: 1.4, opacity: 0.8 }
  },
  
  bold: {
    headline: { size: 160, tracking: -0.03, lineHeight: 0.9, weight: 900 },
    subhead: { size: 52, tracking: 0.02, lineHeight: 1.2, weight: 700 }
  }
}

// Automatic text sizing based on content length
export function adaptiveTextSize(text: string, role: 'hero' | 'sub' | 'body'): number {
  const baseSize = TYPE_SCALE[role][0]
  const maxSize = TYPE_SCALE[role][1]
  
  // Longer text = smaller size
  const charCount = text.length
  if (charCount < 20) return maxSize
  if (charCount > 60) return baseSize
  
  // Linear interpolation between base and max
  return Math.round(maxSize - ((charCount - 20) / 40) * (maxSize - baseSize))
}

// Text animation presets
export const TextAnimations = {
  charByChar: (text: string, startFrame: number) => 
    text.split('').map((char, i) => ({
      char,
      opacity: interpolate(frame, [startFrame + i * 2, startFrame + i * 2 + 10], [0, 1]),
      translateY: interpolate(frame, [startFrame + i * 2, startFrame + i * 2 + 15], [20, 0], {
        easing: Easing.bezier(0.16, 1, 0.3, 1)
      })
    })),
  
  wordByWord: (text: string, startFrame: number) =>
    text.split(' ').map((word, i) => ({
      word,
      opacity: spring({ frame, from: 0, to: 1, delay: startFrame + i * 5, config: SpringPresets.snappy })
    })),
    
  maskReveal: (text: string, startFrame: number, duration: number) => ({
    clipPath: interpolate(
      frame, 
      [startFrame, startFrame + duration], 
      ['inset(0 100% 0 0)', 'inset(0 0 0 0)'],
      { easing: Easing.bezier(0.16, 1, 0.3, 1) }
    )
  })
}
```

---

## Phase 3: Enhanced Agent Prompts & Workflow

### 3.1 Revised System Prompt

**Add to SYSTEM in `backend/src/chat.ts`:**

```
ADVANCED MOTION PRINCIPLES (ALWAYS FOLLOW):

1. NEVER use linear timing — every interpolate() needs Easing.bezier() or spring()
2. ALWAYS add anticipation before movement (scale 0.95 before scale 1.1 entrance)  
3. ALWAYS add settle/overshoot after movement (spring with damping 12-20)
4. LAYER depth: at least one element moving in Z-space (scale + translateY combo)
5. STAGGER everything: mapped arrays need index * 3-5 frame offset
6. OVERLAP beats: start next element 10-15 frames before previous finishes
7. VALIDATE layout: use layout_plan before write_composition
8. NO overflow: check all translateX/Y ranges stay within canvas bounds
9. NO z-index conflicts: background=1, content=10, overlays=20, UI=30
10. PROFESSIONAL endings: spring settle, fade with hold, or mask close — never abrupt stop

QUALITY GATES (MUST PASS BEFORE PREVIEW):
- validate_composition returns ok:true with zero errors
- No linear easing warnings
- No overflow warnings  
- At least one spring() in composition
- At least one Easing.bezier() per animated element
- Stagger present in any .map() iteration
- Z-index declared for all positioned elements
```

### 3.2 Enhanced Workflow

**Update tool call order:**

```typescript
// OLD workflow:
load_skill → plan_motion → write_composition → validate → preview

// NEW workflow:
prefetch_tools → 
intent_deep_analyze →
load_motion_preset (for beat types) →
layout_plan (element positioning) →
plan_motion_advanced (with preset references) →
write_composition_v2 (with layout hints) →
auto_validate_loop (max 2 iterations) →
design_analyze (motion quality score) →
[if score < 70: auto_enhance] →
verify_no_errors →
preview_composition
```

### 3.3 New Tools

```typescript
// Add to backend/src/remotion/tools.ts

load_motion_preset: tool({
  description: "Load professional motion preset (timing + easing) for a beat type.",
  inputSchema: z.object({
    beatType: z.enum(['entrance', 'transition', 'settle', 'exit', 'emphasis'])
  }),
  execute: async ({ beatType }) => {
    const preset = MotionPresets[beatType]
    return { 
      preset,
      snippet: generateCodeSnippet(preset),
      timing: { duration: preset.duration, easing: preset.easing }
    }
  }
}),

auto_enhance_motion: tool({
  description: "Automatically upgrade linear animations to advanced motion. " +
               "Adds springs, easing curves, staggers, and overlaps.",
  inputSchema: z.object({}),
  execute: async () => {
    let code = store.current().code
    
    // Replace all linear interpolate with bezier
    code = code.replace(
      /interpolate\(frame,\s*\[([^\]]+)\],\s*\[([^\]]+)\]\)/g,
      'interpolate(frame, [$1], [$2], { easing: Easing.bezier(0.16, 1, 0.3, 1) })'
    )
    
    // Add staggers to maps
    code = code.replace(
      /\.map\(\((\w+),\s*(\w+)\)\s*=>/g,
      '.map(($1, $2) => { const stagger = $2 * 3; // 3-frame offset\nreturn'
    )
    
    const checks = checkComposition(code)
    if (checks.some(c => c.level === 'error')) {
      return { ok: false, note: 'Auto-enhance would break code — manual fixes needed' }
    }
    
    const n = store.write(code, { bumpVersion: true })
    return { ok: true, version: n, enhancements: ['Added easing curves', 'Added staggers'] }
  }
}),

verify_no_errors: tool({
  description: "Final validation gate — confirms zero errors before preview. " +
               "This is a blocking check; if it fails, the agent MUST fix before continuing.",
  inputSchema: z.object({}),
  execute: async () => {
    const { code, version } = store.current()
    const checks = checkComposition(code)
    const errors = checks.filter(c => c.level === 'error')
    const layoutWarnings = checks.filter(c => 
      c.level === 'warn' && /overflow|overlap|z-index/.test(c.message)
    )
    
    if (errors.length > 0 || layoutWarnings.length > 0) {
      return {
        ok: false,
        blocking: true,
        errors,
        warnings: layoutWarnings,
        instruction: 'DO NOT PREVIEW. Fix these issues with edit_file or write_composition first.'
      }
    }
    
    return { ok: true, version, ready: true }
  }
})
```

---

## Phase 4: Testing & Quality Assurance

### 4.1 Test Suite for Motion Quality

**New File:** `backend/src/remotion/__tests__/motion-quality.test.ts`

```typescript
describe('Motion Quality Enforcement', () => {
  test('No linear interpolations without easing', () => {
    const code = generateComposition({ beatType: 'entrance' })
    expect(code).not.toMatch(/interpolate\(frame[^)]*\)\s*(?!,)/) // no naked interpolate
    expect(code).toMatch(/Easing\.bezier|spring\(/) // has easing or spring
  })
  
  test('All positioned elements have z-index', () => {
    const code = generateComposition({ elements: 3 })
    const positioned = code.match(/position:\s*['"]absolute['"]/g) || []
    const zIndexes = code.match(/zIndex:\s*\d+/g) || []
    expect(zIndexes.length).toBeGreaterThanOrEqual(positioned.length)
  })
  
  test('No overflow: all translateX/Y within canvas', () => {
    const code = generateComposition({ hasAnimation: true })
    const analysis = LayoutEngine.analyzeCode(code)
    expect(analysis.overflows).toHaveLength(0)
  })
  
  test('Mapped arrays have staggers', () => {
    const code = generateComposition({ hasList: true })
    if (code.includes('.map(')) {
      expect(code).toMatch(/index\s*\*\s*\d+|delay.*index|stagger/)
    }
  })
  
  test('Every composition has at least one spring', () => {
    const code = generateComposition({ type: 'full' })
    expect(code).toMatch(/spring\(/)
  })
})
```

### 4.2 Validation Regression Tests

```typescript
describe('Validation Correctness', () => {
  test('Catches overflow in interpolate ranges', () => {
    const code = `interpolate(frame, [0, 60], [0, -2000])` // translateX overflow
    const checks = checkComposition(code)
    expect(checks.some(c => c.message.includes('overflow'))).toBe(true)
  })
  
  test('Catches z-index conflicts', () => {
    const code = `
      <div style={{ position: 'absolute', zIndex: 10 }} />
      <div style={{ position: 'absolute', zIndex: 10 }} />
    `
    const checks = checkComposition(code)
    expect(checks.some(c => c.message.includes('z-index'))).toBe(true)
  })
  
  test('Auto-fix applies successfully', () => {
    const code = `const x = Math.random()`
    const fixed = autoFixCode(code)
    expect(fixed).not.toContain('Math.random')
    expect(fixed).toContain('random(')
  })
})
```

---

## Phase 5: Implementation Roadmap

### Sprint 1: Validation & Self-Correction (Week 1-2) — DONE
- [x] Extend `validate.ts` with layout/overflow/z-index checks
- [x] Upgrade `auto_fix_code` with confidence scoring (high auto-applies, medium/low return previews)
- [x] Add `verify_no_errors` blocking gate
- [x] Write validation regression tests (`backend/src/remotion/__tests__/motion-quality.test.ts`, 23 passing)
- [x] Update agent workflow to use validation loop (SYSTEM prompt + quality gates)

### Sprint 2: Motion Library & Presets (Week 3-4) — DONE
- [x] Create `motion-library.ts` with easing/spring presets
- [x] Add `load_motion_preset` tool
- [x] Build `auto_enhance_motion` tool
- [x] Integrate presets into system prompt
- [x] Test motion quality improvements

### Sprint 3: Layout Engine (Week 5-6) — DONE
- [x] Implement `LayoutEngine` class (`backend/src/remotion/layout-engine.ts`)
- [x] Add `layout_plan` tool
- [x] Build overflow/overlap detection
- [x] Create auto-layout strategies (hierarchy/grid/stack)
- [x] Test spatial reasoning

### Sprint 4: Typography & Polish (Week 7) — DONE
- [x] Extend type system with presets (`TypographyPresets`: heroLockup/editorial/bold)
- [x] Add adaptive text sizing (`adaptiveTextSize`)
- [x] Implement text animation presets (`textAnimationSnippet`: charByChar/wordByWord/maskReveal, via `load_motion_preset` text)
- [x] Font pairing logic (existing `font_suggest` + preset roles)
- [x] Polish UI feedback (`TOOL_LABEL` entries for the 4 new tools)

### Sprint 5: Integration & Testing (Week 8) — DONE
- [x] End-to-end workflow testing (validate → auto-fix/enhance → verify loop, max 2 iterations)
- [x] Agent behavior verification (blocking `verify_no_errors` gate before preview)
- [x] Motion quality benchmarking (23-test suite: motion enforcement + validation regression)
- [x] Performance profiling (`pnpm -C backend check` + `pnpm -C frontend check` green; new tools batchable except writes)
- [x] Documentation updates (`docs/API.md` 60-tool catalogue)

---

## Success Metrics

### Code Quality (Zero Tolerance)
- ✅ **0 broken compositions** reach preview in 100 test runs
- ✅ **0 validation errors** after auto-fix loop
- ✅ **0 overflow issues** in generated layouts
- ✅ **0 z-index conflicts** in multi-element scenes

### Motion Quality (Professional Grade)
- ✅ **100% of compositions** have at least one spring()
- ✅ **100% of interpolations** have explicit easing
- ✅ **90%+ of mapped arrays** have staggers
- ✅ **Average design_analyze score > 85** (up from current ~70)
- ✅ **All endings resolve** (spring settle or fade with hold)

### User Experience
- ✅ **Zero manual fixes required** for 90% of generations
- ✅ **First preview works** in 95% of turns
- ✅ **Motion reads as professional** (user feedback: "polished, not basic")
- ✅ **Turn completes in < 3 minutes** including validation

---

## Risk Mitigation

### Risk: Over-correction causes rigidity
**Mitigation:** Allow user to request "minimal" or "experimental" modes that bypass some quality gates

### Risk: Auto-fix breaks intentional design choices
**Mitigation:** Medium/low confidence fixes require preview before applying; high-confidence only for objective errors

### Risk: Layout engine misinterprets hierarchy
**Mitigation:** `layout_plan` is advisory; agent can override with explicit positioning in write_composition

### Risk: Motion presets feel formulaic
**Mitigation:** Presets are starting points; agent can customize easing curves and timing per brief

---

## Maintenance & Evolution

### Phase 6 (Future): Machine Learning Integration
- Train on successful compositions to learn better layout heuristics
- Build motion style transfer (apply one composition's motion to another)
- Predictive overflow detection from brief text alone

### Phase 7 (Future): Advanced Features
- 3D camera choreography (extend existing three_* tools)
- Particle systems with deterministic random
- Advanced text: per-character physics, kinetic typography
- Audio-reactive motion (beat detection → frame timing)

---

## Conclusion

This plan transforms the Motion agent from a **code generator** into a **motion design system** that:

1. **Never outputs broken code** (validation loop with auto-fix)
2. **Produces professional motion by default** (presets, springs, easing)
3. **Handles spatial complexity** (layout engine, overflow detection)
4. **Self-corrects quality issues** (auto-enhance, design scoring)

**Implementation time:** 8 weeks with one developer  
**Maintenance burden:** Low — most logic is deterministic, no external APIs  
**User impact:** Immediate — every composition generated after Phase 1 is guaranteed valid

**Next step:** Review this plan, prioritize sprints, and begin Sprint 1 (Validation & Self-Correction).
