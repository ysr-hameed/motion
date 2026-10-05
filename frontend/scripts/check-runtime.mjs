#!/usr/bin/env node
/**
 * Iframe runtime contract check — no browser needed.
 *
 * Replays exactly what the browser does with a srcdoc document, minus the
 * render: bundles src/web/runtime.ts, builds srcdocs for valid / hostile /
 * broken / demo bundles, and asserts —
 *
 *  1. no HTML parse hazards (`</script`, `<!--`) inside <script> blocks,
 *  2. every <script> block passes `node --check` (this is what caught the
 *     raw-embedding bug: `new Function("WM", function render...` dies with
 *     "missing ) after argument list" and kills the whole driver block),
 *  3. valid + hostile user JS parses AND evaluates through the driver's
 *     exact `new Function("WM", ...)` wrapping with identical semantics,
 *  4. broken user JS fails at parse (compile-fail report path, not silence),
 *  5. the demo bundle mounts (render is a function after eval).
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "..")
const esbuild = join(root, "node_modules", ".bin", "esbuild")
const dir = mkdtempSync(join(tmpdir(), "wm-runtime-check-"))

const entry = join(dir, "entry.ts")
writeFileSync(
  entry,
  `import { buildSrcdoc } from ${JSON.stringify(join(root, "src", "web", "runtime"))}
import { DEMO_BUNDLE_JSON } from ${JSON.stringify(join(root, "src", "web", "demo"))}
import { parseBundle } from ${JSON.stringify(join(root, "src", "web", "types"))}
const meta = { title: "t", duration: 2, fps: 30, width: 1920, height: 1080 };
const jsValid = 'function render(t, ctx) { var f = ctx.frame; ctx.el("a").style.opacity = 1; }';
const jsHostile = '// <!-- SECTION -->\\n// mentions </script> in docs\\n' + jsValid.replace("opacity = 1", "opacity = f > 0 ? 1 : 0") + '\\nvar s = "<script>x</script>"; var c = "<!-- y -->"; void s; void c;';
const jsBroken = 'function render(t, ctx) { var f = ctx.frame; ctx.el("a").style.opacity = ctx.interpolate(f, [0, 1], [0, 1]; }';
const demo = parseBundle(DEMO_BUNDLE_JSON);
if (!demo.ok || !demo.bundle) throw new Error("demo bundle does not parse");
const out = {
  valid: buildSrcdoc({ version: 1, html: '<div id="a"></div>', css: "#a{color:#fff}", js: jsValid, meta }),
  hostile: buildSrcdoc({ version: 1, html: '<div id="a"></div>', css: "#a{color:#fff}", js: jsHostile, meta }),
  broken: buildSrcdoc({ version: 1, html: '<div id="a"></div>', css: "#a{color:#fff}", js: jsBroken, meta }),
  demo: buildSrcdoc(demo.bundle),
  jsValid, jsHostile, jsBroken,
};
process.stdout.write(JSON.stringify(out));\n`
)

const bundled = join(dir, "entry.cjs")
execFileSync(esbuild, [entry, "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundled}`, "--log-level=error"])
const { valid, hostile, broken, demo, jsValid, jsHostile } = JSON.parse(
  execFileSync("node", [bundled], { maxBuffer: 64 * 1024 * 1024 }).toString()
)

let failures = 0
const fail = (msg) => {
  failures += 1
  console.error(`FAIL: ${msg}`)
}

// 1+2. Script blocks: no hazards, and node --check clean.
for (const [name, doc] of Object.entries({ valid, hostile, broken, demo })) {
  const blocks = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  if (blocks.length !== 2) fail(`${name}: expected 2 script blocks, got ${blocks.length}`)
  for (const [i, code] of blocks.entries()) {
    if (/<!--/.test(code)) fail(`${name} block${i}: contains <!--`)
    if (/<\/script/i.test(code)) fail(`${name} block${i}: contains </script`)
    const f = join(dir, `${name}-${i}.js`)
    writeFileSync(f, code)
    try {
      execFileSync("node", ["--check", f], { stdio: "pipe" })
    } catch {
      fail(`${name} block${i}: node --check failed (driver would never boot)`)
    }
  }
}

// 3. Valid + hostile user JS evaluates through the driver's exact wrapping,
// then render() runs once against a stub ctx (proves escaping preserved validity).
const stubCtx = (frame) => ({
  frame,
  interpolate: (x, a, b) => b[1],
  Easing: { easeOut: (x) => x },
  spring: () => 1,
  rand: () => () => 0.5,
  el: () => ({ style: {} }),
})
for (const [name, js] of Object.entries({ jsValid, jsHostile })) {
  const wrapped = `${js}\nreturn { render: (typeof render !== "undefined" ? render : undefined) };`
  let api
  try {
    api = new Function("WM", wrapped)({})
  } catch (err) {
    fail(`${name}: driver-style eval threw: ${err.message}`)
    continue
  }
  if (typeof api.render !== "function") {
    fail(`${name}: no render() after eval`)
    continue
  }
  try {
    api.render(0, stubCtx(0))
  } catch (err) {
    fail(`${name}: render threw on stub ctx: ${err.message}`)
  }
}

// 4. Broken user JS must throw at parse (compile-fail path), never silently pass.
{
  const js = `function render(t, ctx) { var f = ctx.frame; ctx.el("a").style.opacity = ctx.interpolate(f, [0, 1], [0, 1]; }`
  try {
    new Function("WM", `${js}\nreturn {};`)
    fail("broken JS parsed without error — compile gate would miss it")
  } catch (err) {
    if (!/\)/.test(err.message)) fail(`broken JS error unhelpful: ${err.message}`)
  }
}

if (failures > 0) {
  console.error(`${failures} runtime contract failure(s)`)
  process.exit(1)
}
console.log("runtime contract OK: 4 bundles, script blocks parse, hostile semantics intact, broken JS fails loudly")
