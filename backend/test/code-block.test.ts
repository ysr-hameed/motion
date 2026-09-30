import { test } from "node:test"
import assert from "node:assert/strict"
import { extractComponent, hasDefaultExport, summariseComponent } from "../src/lib/code-block"

/**
 * The extractor is the first thing every model response passes through.
 * A regression here does not throw — it silently ships a truncated
 * composition, so these cover the shapes models actually emit.
 */

test("plain component with no decoration", () => {
  const src = `const A = () => null\nexport default A\n`
  const { code } = extractComponent(src)
  assert.equal(code, "const A = () => null\nexport default A\n")
  assert.ok(hasDefaultExport(code))
})

test("markdown fence is unwrapped, and prose outside it is discarded", () => {
  const raw = "Here you go:\n\n```tsx\nexport default function C() { return null }\n```\n\nHope that helps!"
  const { code, trailing } = extractComponent(raw)
  assert.match(code, /export default function C/)
  assert.doesNotMatch(code, /```/)
  // Anything outside the closing fence is dropped, not carried into the
  // file. `trailing` is for prose that follows unfenced code.
  assert.equal(trailing, "")
  assert.doesNotMatch(code, /Hope that helps/)
})

test("json string payload is unwrapped by the caller-side fence strip", () => {
  const raw = `\`\`\`tsx\nexport default () => <div />\n\`\`\``
  const { code } = extractComponent(raw)
  assert.match(code, /export default/)
})

test("prose before the code is dropped", () => {
  const raw = `Sure! Here's the composition you asked for.\n\nimport { AbsoluteFill } from "remotion"\n\nexport default function C() {\n  return <AbsoluteFill />\n}\n\nLet me know if you want changes.`
  const { code, trailing } = extractComponent(raw)
  assert.match(code, /^import \{ AbsoluteFill \}/)
  assert.match(code, /export default function C/)
  assert.doesNotMatch(code, /Sure! Here's/)
  assert.equal(trailing, "Let me know if you want changes.")
})

test("a string containing braces does not end the scan early", () => {
  const raw = `export default function C() {\n  const label = "} not the end {"\n  return <div>{label}</div>\n}\nTRAILING`
  const { code, trailing } = extractComponent(raw)
  assert.match(code, /not the end/)
  assert.match(code, /<\/div>/)
  assert.equal(trailing, "TRAILING")
})

test("template literals with braces are handled", () => {
  const raw = "export default function C() {\n  return <div style={{ color: `rgb(${1}, ${2}, ${3})` }} />\n}\nEND"
  const { code, trailing } = extractComponent(raw)
  assert.match(code, /rgb\(/)
  assert.equal(trailing, "END")
})

test("missing export degrades instead of losing the file", () => {
  const raw = "Here:\nconst A = () => null\n"
  const { code } = extractComponent(raw)
  assert.match(code, /const A/)
  assert.equal(hasDefaultExport(code), false)
})

test("empty response is empty", () => {
  assert.equal(extractComponent("").code, "")
  assert.equal(extractComponent("   \n  ").code, "")
})

test("summary reports structure without reading values", () => {
  const code = `export default function C() {\n  return (\n    <AbsoluteFill>\n      <Sequence from={0}><Series /></Sequence>\n    </AbsoluteFill>\n  )\n}\n`
  const s = summariseComponent(code)
  assert.match(s, /8 lines/)
  assert.match(s, /Sequence/)
  assert.match(s, /Series/)
})

/**
 * A real failure: the model produced 14.7 KB of correct Remotion, forgot
 * the `export default` line and appended a note about font setup. These
 * cover recovering that without regenerating the whole file.
 */
test("an unexported root component is recovered", () => {
  const src = `const FPS = 30
const PALETTE = { bg: "#000" }

const Grain = () => <div />

const Cut = () => {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill>
      <Grain />
      <span>{f}</span>
    </AbsoluteFill>
  )
}
`
  const { code } = extractComponent(src)
  assert.ok(hasDefaultExport(code))
  assert.match(code.trim(), /export default Cut$/)
})

test("a file that already exports is left alone", () => {
  const src = `const Inner = () => <div />
const Cut = () => <Inner />
export default Cut
`
  const { code } = extractComponent(src)
  assert.match(code, /export default Cut/)
  assert.doesNotMatch(code, /export default Inner/)
})

test("constants are never mistaken for the root component", () => {
  const src = `const FPS = 30
const DURATION = 150
const Cut = () => <div>{FPS}</div>
`
  const { code } = extractComponent(src)
  assert.match(code, /export default Cut/)
})

test("two unreferenced components are ambiguous and left for the repairer", () => {
  const src = `const A = () => <div />
const B = () => <div />
`
  assert.equal(extractComponent(src).code, src.trim() + "\n")
})
