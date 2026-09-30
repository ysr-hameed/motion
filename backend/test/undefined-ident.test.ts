/**
 * The failure that kept shipping: the model writes JSX using a component
 * it never imported. Every other check passes, the artifact is published,
 * and the player then fails with a bare "CheckCircle2 is not defined" —
 * the most expensive possible place to discover a typo.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { lintComposition } from "../src/lib/code-lint"

const free = (code: string): string[] => {
  const m = lintComposition(code).find((i) => i.code === "undefined-identifier")
  if (!m) return []
  return m.message
    .replace(/^Not defined.*?: /, "")
    .split(". If")[0]!
    .split(", ")
    .map((s) => s.trim())
}

test("an unimported component is caught", () => {
  const code = `import { AbsoluteFill } from "remotion"
export default () => <AbsoluteFill><CheckCircle2 /></AbsoluteFill>
`
  assert.deepEqual(free(code), ["CheckCircle2"])
  const issue = lintComposition(code).find((i) => i.code === "undefined-identifier")
  assert.equal(issue?.severity, "error", "must block, not warn")
})

test("several unimported names are all reported", () => {
  const code = `import { AbsoluteFill } from "remotion"
export default () => <AbsoluteFill><TrendingUp /><Sparkles /></AbsoluteFill>
`
  assert.deepEqual(free(code).sort(), ["Sparkles", "TrendingUp"])
})

test("jsx attribute names are not free variables", () => {
  // `style` and `src` are attributes, not variables. Reporting them would
  // block a good composition and send it to the repairer for nothing.
  const code = `import { AbsoluteFill, Img } from "remotion"
export default () => <AbsoluteFill><Img src="a.png" style={{ margin: 0 }} /></AbsoluteFill>
`
  assert.deepEqual(free(code), [])
})

test("the provided render scope is not free", () => {
  const code = `import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion"
export default () => {
  const f = useCurrentFrame()
  return <AbsoluteFill style={{ opacity: interpolate(f, [0, 30], [0, 1]) }}>
    <Icons.Check size={16} />
    <shapes.Circle />
  </AbsoluteFill>
}
`
  assert.deepEqual(free(code), [])
})

test("locally declared helpers, params and destructuring are fine", () => {
  const code = `const Bar = ({ v, i }) => <div key={i}>{v}</div>
const wrap = (x) => [x]
export default () => <div>{wrap([1, 2]).map((v, i) => <Bar key={i} v={v} />)}</div>
`
  assert.deepEqual(free(code), [])
})

test("assignments are not mistaken for attributes", () => {
  const code = `export default () => {
  let w = 4
  const scale = w / 2
  return <div style={{ width: scale * w }} />
}
`
  assert.deepEqual(free(code), [])
})

test("deeply nested style objects do not leak attribute names", () => {
  // Regression: the old one-level tag regex let `style` through on
  // 3+-level nesting, and the model burned whole runs fighting the phantom.
  const code = `import { AbsoluteFill } from "remotion"
export default function Composition() {
  const frame = 1
  return (
    <AbsoluteFill style={{ background: "red", transform: [{ translateX: 10 }], shadow: { a: { b: 1 } } }}>
      <h1 style={{ opacity: frame, textShadow: "0 4px 20px rgba(0,0,0,0.25)" }}>Hi</h1>
    </AbsoluteFill>
  )
}
`
  assert.deepEqual(free(code), [])
})

test("comparisons and array types are not treated as tags", () => {
  const code = `import { AbsoluteFill } from "remotion"
export default function Composition() {
  const frame = 1
  const list: Array<string> = ["a"]
  let w = 4
  if (frame < 20) w = 8
  const scale = w / 2
  return <AbsoluteFill style={{ width: scale }}>{list.map((s) => <span key={s}>{s}</span>)}</AbsoluteFill>
}
`
  assert.deepEqual(free(code), [])
})

test("type annotations, casts and interfaces are values-blind", () => {
  const code = `import { AbsoluteFill } from "remotion"
interface Props { title: string }
type Alias = string | number
export default function Composition() {
  const scale: number = 2
  const label = "hi" as string
  const render = (n: number): string => String(n)
  return <AbsoluteFill><h1>{label}{render(scale)}</h1></AbsoluteFill>
}
`
  assert.deepEqual(free(code), [])
})

test("object literals, ternaries and labels keep their meaning", () => {
  // The type stripper must not eat real code: object values, ternary
  // branches and assignments all survive.
  const code = `import { AbsoluteFill } from "remotion"
export default function Composition(props: { loud: boolean }) {
  const style = { color: props.loud ? "red" : "white", margin: 0 }
  const w = 4
  return <AbsoluteFill style={style}><h1>{w > 2 ? "big" : "small"}</h1></AbsoluteFill>
}
`
  assert.deepEqual(free(code), [])
})

test("hyphenated svg attributes are not free variables", () => {
  const code = `export default () => (
  <svg viewBox="0 0 10 10"><path d="M0 0h10" stroke-width={2} fill="none" /></svg>
)
`
  assert.deepEqual(free(code), [])
})
