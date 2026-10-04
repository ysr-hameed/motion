/**
 * AGENT_UPGRADE_PLAN Phase 2: layout & spatial reasoning.
 *
 * Positions elements BEFORE code generation so overflow and overlap are
 * planned away, not validated away. Pure and deterministic — the layout_plan
 * tool and validate.ts share this one rule set.
 */

export type ElementType = "text" | "image" | "shape" | "video"

export interface ElementBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PlannedElement {
  id: string
  type: ElementType
  bounds: ElementBounds
  zIndex: number
}

export interface LayoutConflict {
  type: "overflow" | "overlap" | "z-conflict"
  elements: string[]
  fix: string
}

export interface LayoutPlan {
  elements: PlannedElement[]
  conflicts: LayoutConflict[]
  /** Ready-to-paste absolute-position hints, one per element. */
  codeHints: string[]
}

export type LayoutStrategy = "hierarchy" | "grid" | "stack"

const CANVAS = { width: 1920, height: 1080 } as const
const SAFE_MARGIN = 60

const Z_BY_TYPE: Record<ElementType, number> = {
  image: 1,
  shape: 5,
  text: 10,
  video: 10,
}

const ZONES = {
  title: { y: 120, height: 324 },
  body: { y: 444, height: 540 },
  cta: { y: 984, height: 96 },
}

export class LayoutEngine {
  constructor(
    private readonly canvas = { ...CANVAS },
    private readonly safeMargin = SAFE_MARGIN
  ) {}

  detectOverflow(el: PlannedElement): boolean {
    return (
      el.bounds.x < this.safeMargin ||
      el.bounds.y < this.safeMargin ||
      el.bounds.x + el.bounds.width > this.canvas.width - this.safeMargin ||
      el.bounds.y + el.bounds.height > this.canvas.height - this.safeMargin
    )
  }

  /** Same-plane overlaps are unintentional; separated z is a deliberate stack. */
  detectOverlap(a: PlannedElement, b: PlannedElement): boolean {
    if (Math.abs(a.zIndex - b.zIndex) > 1) return false
    return !(
      a.bounds.x + a.bounds.width < b.bounds.x ||
      b.bounds.x + b.bounds.width < a.bounds.x ||
      a.bounds.y + a.bounds.height < b.bounds.y ||
      b.bounds.y + b.bounds.height < a.bounds.y
    )
  }

  detectConflicts(elements: PlannedElement[]): LayoutConflict[] {
    const conflicts: LayoutConflict[] = []
    for (const el of elements) {
      if (this.detectOverflow(el)) {
        conflicts.push({
          type: "overflow",
          elements: [el.id],
          fix: `Pull "${el.id}" inside the ${this.safeMargin}px safe margin or scale it down — it escapes the ${this.canvas.width}x${this.canvas.height} canvas.`,
        })
      }
    }
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i]!
        const b = elements[j]!
        if (a.zIndex === b.zIndex && this.detectOverlap(a, b)) {
          conflicts.push({
            type: "z-conflict",
            elements: [a.id, b.id],
            fix: `"${a.id}" and "${b.id}" overlap on zIndex ${a.zIndex}. Separate them (background=1, content=10, overlays=20, UI=30) or move one in time.`,
          })
        } else if (this.detectOverlap(a, b)) {
          conflicts.push({
            type: "overlap",
            elements: [a.id, b.id],
            fix: `"${a.id}" and "${b.id}" overlap on the same plane. Reposition one or stagger them in time.`,
          })
        }
      }
    }
    return conflicts
  }

  autoLayout(
    elements: Array<{ id: string; type: ElementType; width: number; height: number }>,
    strategy: LayoutStrategy = "hierarchy"
  ): LayoutPlan {
    const planned =
      strategy === "grid"
        ? this.gridLayout(elements)
        : strategy === "stack"
          ? this.stackLayout(elements)
          : this.hierarchyLayout(elements)
    return {
      elements: planned,
      conflicts: this.detectConflicts(planned),
      codeHints: planned.map(
        (el) =>
          `<div style={{ position: 'absolute', left: ${el.bounds.x}, top: ${el.bounds.y}, width: ${el.bounds.width}, height: ${el.bounds.height}, zIndex: ${el.zIndex} }}> {/* ${el.id} */`
      ),
    }
  }

  private centerX(width: number): number {
    return Math.round((this.canvas.width - width) / 2)
  }

  private clamp(el: PlannedElement): PlannedElement {
    const x = Math.max(this.safeMargin, Math.min(el.bounds.x, this.canvas.width - this.safeMargin - el.bounds.width))
    const y = Math.max(this.safeMargin, Math.min(el.bounds.y, this.canvas.height - this.safeMargin - el.bounds.height))
    return { ...el, bounds: { ...el.bounds, x: Math.round(x), y: Math.round(y) } }
  }

  private hierarchyLayout(
    elements: Array<{ id: string; type: ElementType; width: number; height: number }>
  ): PlannedElement[] {
    return elements.map((el, i) => {
      const zIndex = Z_BY_TYPE[el.type] + i
      // Large text is a title; small text lives in the body; media fills behind.
      if (el.type === "text" && el.height > 100) {
        return this.clamp({
          id: el.id,
          type: el.type,
          bounds: { x: this.centerX(el.width), y: ZONES.title.y, width: el.width, height: el.height },
          zIndex,
        })
      }
      if (el.type === "text") {
        return this.clamp({
          id: el.id,
          type: el.type,
          bounds: { x: this.centerX(el.width), y: ZONES.body.y + i * 20, width: el.width, height: el.height },
          zIndex,
        })
      }
      if (el.type === "image" || el.type === "video") {
        return this.clamp({
          id: el.id,
          type: el.type,
          bounds: { x: this.centerX(el.width), y: Math.round((this.canvas.height - el.height) / 2), width: el.width, height: el.height },
          zIndex: 1,
        })
      }
      return this.clamp({
        id: el.id,
        type: el.type,
        bounds: { x: this.centerX(el.width), y: ZONES.cta.y - el.height, width: el.width, height: el.height },
        zIndex,
      })
    })
  }

  private gridLayout(
    elements: Array<{ id: string; type: ElementType; width: number; height: number }>
  ): PlannedElement[] {
    const cols = Math.max(1, Math.ceil(Math.sqrt(elements.length)))
    return elements.map((el, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cellW = (this.canvas.width - this.safeMargin * 2) / cols
      const x = Math.round(this.safeMargin + col * cellW + (cellW - el.width) / 2)
      const y = Math.round(this.safeMargin + row * 320)
      return this.clamp({
        id: el.id,
        type: el.type,
        bounds: { x, y, width: el.width, height: el.height },
        zIndex: Z_BY_TYPE[el.type] + i,
      })
    })
  }

  private stackLayout(
    elements: Array<{ id: string; type: ElementType; width: number; height: number }>
  ): PlannedElement[] {
    let y = 140
    return elements.map((el, i) => {
      const placed: PlannedElement = {
        id: el.id,
        type: el.type,
        bounds: { x: this.centerX(el.width), y, width: el.width, height: el.height },
        zIndex: Z_BY_TYPE[el.type] + i,
      }
      y += el.height + 48
      return this.clamp(placed)
    })
  }
}

/**
 * Source-level overflow scan for validate.ts and tests: finds
 * interpolate() output peaks that escape the canvas.
 */
export function analyzeCodeOverflow(code: string): Array<{ line: number; peak: number }> {
  const found: Array<{ line: number; peak: number }> = []
  for (const m of code.matchAll(/interpolate\(\s*frame\s*,\s*\[([^\]]*)\]\s*,\s*\[([^\]]*)\]/g)) {
    const outs = (m[2] ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
    if (outs.length === 0) continue
    const peak = Math.max(...outs.map((n) => Math.abs(n)))
    if (peak > CANVAS.width) {
      found.push({ line: code.slice(0, m.index ?? 0).split("\n").length, peak })
    }
  }
  return found
}

/**
 * Visual composition guidance using design principles.
 */
export function buildCompositionHints(
  elements: Array<{ id: string; type: ElementType; width: number; height: number }>,
  plannedElements: PlannedElement[],
  canvasWidth: number,
  canvasHeight: number
): {
  ruleOfThirds: string[]
  focalPoint: string
  balance: string
  readingFlow: string
} {
  const thirds = {
    vertical: [canvasWidth / 3, (2 * canvasWidth) / 3],
    horizontal: [canvasHeight / 3, (2 * canvasHeight) / 3],
  }

  const ruleOfThirds: string[] = []
  const dominantElement = plannedElements.find(el => 
    el.type === 'text' && el.bounds.height > 100
  ) || plannedElements[0]

  if (dominantElement) {
    const centerX = dominantElement.bounds.x + dominantElement.bounds.width / 2
    const centerY = dominantElement.bounds.y + dominantElement.bounds.height / 2
    
    const nearThirdX = Math.abs(centerX - thirds.vertical[0]) < Math.abs(centerX - thirds.vertical[1]) ? thirds.vertical[0] : thirds.vertical[1]
    const nearThirdY = Math.abs(centerY - thirds.horizontal[0]) < Math.abs(centerY - thirds.horizontal[1]) ? thirds.horizontal[0] : thirds.horizontal[1]
    
    if (Math.abs(centerX - nearThirdX) > 100) {
      ruleOfThirds.push(`Consider moving "${dominantElement.id}" closer to the ${nearThirdX < canvasWidth/2 ? 'left' : 'right'} third line (x=${Math.round(nearThirdX)}) for stronger composition`)
    }
    
    if (Math.abs(centerY - nearThirdY) > 100) {
      ruleOfThirds.push(`Consider aligning "${dominantElement.id}" with the ${nearThirdY < canvasHeight/2 ? 'upper' : 'lower'} third line (y=${Math.round(nearThirdY)})`)
    }
  }

  const focalPoint = dominantElement 
    ? `"${dominantElement.id}" serves as the focal point - ensure it has strongest visual weight through size, contrast, or position`
    : "No clear focal point detected - designate one element as the primary focus"

  const balance = (() => {
    const leftElements = plannedElements.filter(el => el.bounds.x + el.bounds.width/2 < canvasWidth/2)
    const rightElements = plannedElements.filter(el => el.bounds.x + el.bounds.width/2 >= canvasWidth/2)
    
    if (leftElements.length === 0 || rightElements.length === 0) {
      return "Consider balancing elements across both sides of the frame for visual stability"
    }
    return "Visual balance achieved with elements on both sides of the frame"
  })()

  const readingFlow = (() => {
    if (plannedElements.length < 2) return "Single element - no reading flow needed"
    
    const sorted = [...plannedElements].sort((a, b) => a.bounds.y - b.bounds.y)
    const isZPattern = sorted.some((el, i) => 
      i > 0 && el.bounds.x > sorted[i-1].bounds.x + sorted[i-1].bounds.width/2
    )
    
    return isZPattern 
      ? "Elements follow a Z-pattern reading flow - good for Western audiences"
      : "Consider arranging elements in a Z-pattern for natural reading flow"
  })()

  return {
    ruleOfThirds,
    focalPoint,
    balance,
    readingFlow,
  }
}
