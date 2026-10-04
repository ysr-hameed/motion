/**
 * Measures the real render in the browser and reports what is actually wrong.
 *
 * The agent writes pixel-positioned layout and could not see the result, so
 * overlap and wrong scale were guaranteed rather than occasional, and the user
 * had to say the same thing three times. These measurements come from the
 * Player's own DOM at real frames, so they are facts rather than guesses.
 *
 * Nothing is rasterised here: the numbers are a few hundred bytes and cost no
 * dependency. The optional screenshot is a separate, opt-in path.
 */

export interface Box {
  /** Short label from the element's text, for a human-readable finding. */
  label: string
  tag: string
  left: number
  top: number
  right: number
  bottom: number
  fontSize: number | null
}

export interface LayoutReport {
  frame: number
  findings: string[]
  boxes: Box[]
}

const CANVAS_W = 1920
const CANVAS_H = 1080
const SAFE_MARGIN = 96

/** Ignore decorative layers that are invisible at the sampled frame. */
function isVisible(el: Element): boolean {
  const cs = getComputedStyle(el)
  if (cs.display === "none" || cs.visibility === "hidden") return false
  if (Number(cs.opacity) < 0.05) return false
  const r = el.getBoundingClientRect()
  return r.width > 2 && r.height > 2
}

function labelOf(el: Element): string {
  const own = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim() ?? "")
    .join(" ")
    .trim()
  if (own) return own.slice(0, 28)
  const deep = el.querySelector("span,div,p,h1,h2,h3")
  return (deep?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28)
}

/**
 * Collects elements that carry visible type, converted into composition-space
 * coordinates (the Player scales its DOM down, so raw rects are not canvas
 * units).
 */
function measure(root: Element, scale: number): Box[] {
  const base = root.getBoundingClientRect()
  const out: Box[] = []
  const seen = new Set<Element>()

  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (!isVisible(el)) continue

    const directText = Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0
    )
    const isLeaf = el.children.length === 0
    if (!directText && !isLeaf) continue

    const r = el.getBoundingClientRect()
    if (r.width * scale < 4 || r.height * scale < 4) continue
    if (seen.has(el)) continue
    seen.add(el)

    const cs = getComputedStyle(el)
    const size = Number.parseFloat(cs.fontSize)
    out.push({
      label: labelOf(el),
      tag: el.tagName.toLowerCase(),
      left: Math.round((r.left - base.left) / scale),
      top: Math.round((r.top - base.top) / scale),
      right: Math.round((r.right - base.left) / scale),
      bottom: Math.round((r.bottom - base.top) / scale),
      fontSize: Number.isFinite(size) && size > 1 ? Math.round(size / scale) : null,
    })
  }
  return out
}

function overlaps(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? Math.round(Math.min(w, h)) : 0
}

/** Judges a set of boxes. Pure, so it is easy to reason about and to trim. */
export function judge(boxes: Box[], frame: number, canvas = { w: CANVAS_W, h: CANVAS_H }): LayoutReport {
  const findings: string[] = []
  const text = boxes.filter((b) => b.label.length > 0)

  // 1. Off-canvas. The single most common cause of "something is missing".
  for (const b of text) {
    if (b.left < -8 || b.top < -8 || b.right > canvas.w + 8 || b.bottom > canvas.h + 8) {
      findings.push(
        `Frame ${frame}: "${b.label}" sits outside the ${canvas.w}x${canvas.h} canvas ` +
          `(x ${b.left}..${b.right}, y ${b.top}..${b.bottom}). It will be cropped.`
      )
    }
  }

  // 2. Inside the safe margin.
  for (const b of text) {
    const nearEdge =
      b.left < SAFE_MARGIN ||
      b.top < SAFE_MARGIN ||
      b.right > canvas.w - SAFE_MARGIN ||
      b.bottom > canvas.h - SAFE_MARGIN
    if (nearEdge) {
      findings.push(
        `Frame ${frame}: "${b.label}" is inside the ${SAFE_MARGIN}px safe margin — encoders crop it.`
      )
      break
    }
  }

  // 3. Type on top of type. Both must carry text; a background block behind a
  //    headline is intentional, a headline behind a headline is not.
  for (let i = 0; i < text.length; i++) {
    for (let j = i + 1; j < text.length; j++) {
      const a = text[i]!
      const b = text[j]!
      const px = overlaps(a, b)
      if (px > 6) {
        findings.push(
          `Frame ${frame}: "${a.label}" and "${b.label}" overlap by ${px}px. ` +
            `Stack them in one flex column, or offset one deliberately.`
        )
      }
    }
  }

  // 4. Type scale, against the same contract the prompt states. fontSize
  // is the CSS size (what the ceiling governs); the glyph BOX can be far
  // wider (script faces run wide, tracking spreads caps). Reporting only
  // the size sent agents shrinking heroes that were fine — so a wide box
  // at a legal size names its width AND the fixes that keep impact:
  // shorter copy, tighter tracking, or a narrower face — not just "smaller".
  for (const b of text) {
    const size = b.fontSize
    if (!size) continue
    const width = b.right - b.left
    if (size < 18) {
      findings.push(`Frame ${frame}: "${b.label}" is ${size}px — unreadable as video (floor is 18).`)
    } else if (size > 320) {
      findings.push(`Frame ${frame}: "${b.label}" sets fontSize ${size}px over the 320 ceiling — reduce the px.`)
    } else if (width > canvas.w * 0.92) {
      findings.push(
        `Frame ${frame}: "${b.label}" is only ${size}px but its box is ${width}px wide — it fills the frame. ` +
          `Do NOT just shrink the px into timidity: shorten the copy, tighten letterSpacing, or pick a narrower face first; shrink px only as a last resort.`
      )
    }
  }

  return { frame, findings: dedupe(findings), boxes: boxes.slice(0, 40) }
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)]
}

/**
 * Measures the mounted Player at one frame. Called from the Stage after a seek
 * so the reported frame is the one the user is actually looking at.
 */
export function measureStage(frame: number): LayoutReport | null {
  // The Player wraps the composition in a div that scales to fit.
  const canvas = document.querySelector<HTMLElement>(".__remotion-player, [data-remotion-player]")
  const root = canvas ?? document.querySelector<HTMLElement>("#stage-canvas")
  if (!root) return null

  const rect = root.getBoundingClientRect()
  if (rect.width < 10) return null
  const scale = rect.width / CANVAS_W

  return judge(measure(root, scale), frame)
}