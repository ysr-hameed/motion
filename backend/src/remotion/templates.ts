/**
 * Golden starter generator — no template catalogue.
 *
 * Builds the starter from design tokens — palette + font pair + layout
 * variant picked deterministically from the brief — so the first paint is
 * already art-directed, and no two briefs open the same way.
 *
 * Output is a web bundle ({ html, css, js } JSON in `code`): markup for
 * #wm-stage, a scoped stylesheet, and a script defining render(t, ctx).
 * Every move is a pure function of t. Overlap-proof by construction: text
 * lives in ONE flex column in normal flow, type sizes adapt to copy
 * length, every layer carries a distinct z-index.
 */

import { serializeBundle } from "./bundle"

export interface GoldenStarter {
  /** JSON web bundle. */
  code: string
  plan: { title: string; intent: string; beats: Array<{ from: number; to: number; what: string }>; ending: string }
}

export interface StarterContext {
  product?: string
  brand?: string
  headline?: string
  mood?: string
  /** Seconds of cut. Defaults to 5. */
  seconds?: number
  /** Framing hint from /create. Recorded in the plan; canvas stays 1920x1080. */
  framing?: string
}

interface Tokens {
  bg: string
  ink: string
  accent: string
  glow: string
  display: string
  text: string
  palette: string
  kicker: string
  badge: string
  damping: number
}

const PALETTES: Record<string, Omit<Tokens, "palette">> = {
  cinematic: {
    bg: "#0B0C10", ink: "#F2F3F7", accent: "#FFB340", glow: "rgba(255,179,64,0.12)",
    display: "Unbounded", text: "Manrope",
    kicker: "A MOTION CUT", badge: "WATCH TO THE END", damping: 18,
  },
  energetic: {
    bg: "#101014", ink: "#F4F2EC", accent: "#FF5A5A", glow: "rgba(255,90,90,0.14)",
    display: "Anton", text: "Archivo",
    kicker: "TURN IT UP", badge: "DON'T BLINK", damping: 14,
  },
  playful: {
    bg: "#1B1035", ink: "#F4F2EC", accent: "#FF7AD9", glow: "rgba(255,122,217,0.14)",
    display: "Bricolage Grotesque", text: "Karla",
    kicker: "FRESH DROP", badge: "STAY FOR THE DROP", damping: 12,
  },
  minimal: {
    bg: "#F4F2EC", ink: "#141414", accent: "#E4572E", glow: "rgba(228,87,46,0.10)",
    display: "Syne", text: "Newsreader",
    kicker: "N°01 — INTRO", badge: "SCROLL", damping: 22,
  },
  elegant: {
    bg: "#111214", ink: "#EFE9DC", accent: "#D8B56B", glow: "rgba(216,181,107,0.12)",
    display: "Instrument Serif", text: "Newsreader",
    kicker: "MAISON", badge: "DISCOVER", damping: 26,
  },
  tech: {
    bg: "#0B0E14", ink: "#E8EEF7", accent: "#5AC8FA", glow: "rgba(90,200,250,0.12)",
    display: "Space Grotesk", text: "Space Mono",
    kicker: "SYS.BOOT // V2", badge: "INITIALIZING", damping: 20,
  },
}

function tokensFor(mood: string | undefined): Tokens {
  const m = (mood ?? "").toLowerCase()
  if (/romantic|wedding|signature|handwrit|love|valentine/.test(m)) {
    return { ...PALETTES.elegant!, palette: "elegant", display: "Dancing Script", kicker: "WITH LOVE", badge: "FOREVER", damping: 20 }
  }
  let key = "cinematic"
  if (/energetic|bold|sport|hype|hustle/.test(m)) key = "energetic"
  else if (/playful|fun|quirky|kid|party/.test(m)) key = "playful"
  else if (/minimal|clean|quiet/.test(m)) key = "minimal"
  else if (/elegant|luxury|prestige|editorial|serif|fashion/.test(m)) key = "elegant"
  else if (/tech|futur|saas|data|ai\b|robot|cyber/.test(m)) key = "tech"
  return { ...PALETTES[key]!, palette: key }
}

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Hero size shrinks as copy grows — long titles never fill the frame. */
function heroSize(text: string): number {
  const n = text.trim().length
  if (n <= 8) return 170
  if (n <= 14) return 140
  if (n <= 22) return 112
  return 92
}

function subSize(headline: string): number {
  const n = headline.trim().length
  if (n <= 24) return 46
  if (n <= 48) return 38
  return 32
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function baseCss(t: Tokens): string {
  return [
    `#wm-stage{background:${t.bg};font-family:'${t.text}',sans-serif;overflow:hidden}`,
    `.glow{position:absolute;left:50%;top:38%;width:1100px;height:640px;transform:translate(-50%,0);background:radial-gradient(closest-side,${t.glow},transparent 70%);z-index:1}`,
    `.orb{position:absolute;border-radius:50%;z-index:2}`,
    `.orb-far{left:240px;top:180px;width:420px;height:420px;background:radial-gradient(circle,${t.glow} 0%,transparent 70%)}`,
    `.orb-near{right:200px;bottom:140px;width:560px;height:560px;border:1px solid ${t.accent}33}`,
    `.kicker{font-size:24px;letter-spacing:8px;color:${t.accent};font-family:'${t.text}',sans-serif}`,
    `.badge{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);font-size:22px;letter-spacing:6px;color:${t.accent};font-family:'${t.text}',sans-serif;z-index:20;white-space:nowrap}`,
    `.progress{position:absolute;bottom:0;left:0;height:6px;background:${t.accent};z-index:30}`,
    `.vignette{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(0,0,0,0.42) 100%);z-index:15;pointer-events:none}`,
  ].join("\n")
}

function chromeHtml(): string {
  return `<div class="progress" id="progress"></div><div class="vignette"></div>`
}

function chromeJs(total: number): string[] {
  return [
    `  // Frame chrome: linear progress hairline (time itself is never eased).`,
    `  var progress = ctx.interpolate(f, [0, ${total}], [0, 1]);`,
    `  ctx.el("progress").style.width = (progress * 100) + "%";`,
  ]
}

/** Whole-scene depth rig: punch-zoom + parallax + counter-motion + tracking. */
function depthJs(total: number, settleAt: number): string[] {
  return [
    `  // Depth rig — punch-zoom + parallax + counter-motion (one rig, every golden).`,
    `  var push = ctx.interpolate(f, [0, ${total}], [1, 1.045], { easing: ctx.Easing.bezier(0.25, 0.1, 0.25, 1) });`,
    `  var orbFar = ctx.interpolate(f, [0, ${total}], [0, -26], { easing: ctx.Easing.bezier(0.25, 0.1, 0.25, 1) });`,
    `  var orbNear = ctx.interpolate(f, [0, ${total}], [0, -64], { easing: ctx.Easing.bezier(0.25, 0.1, 0.25, 1) });`,
    `  var track = ctx.interpolate(f, [15, ${settleAt}], [2, 9], { easing: ctx.Easing.easeOut });`,
    `  var counter = f > ${settleAt} ? Math.sin((t - ${settleAt / 30}) * 2.4 + Math.PI) * 4 : 0;`,
    `  var breathe = f > ${settleAt} ? Math.sin((t - ${settleAt / 30}) * 2.4) * 3 : 0;`,
  ]
}

function depthHtml(): string {
  return `<div class="glow" id="glow"></div><div class="orb orb-far" id="orbFar"></div><div class="orb orb-near" id="orbNear"></div>`
}

function depthApply(): string[] {
  return [
    `  ctx.el("orbFar").style.translate = "0 " + orbFar + "px";`,
    `  ctx.el("orbNear").style.translate = "0 " + orbNear + "px";`,
  ]
}

function bundleOf(
  t: Tokens, title: string, html: string, css: string, js: string, seconds: number
): GoldenStarter["code"] {
  void title
  return serializeBundle({
    version: 1,
    html,
    css,
    js,
    meta: {
      title,
      duration: seconds,
      fps: 30,
      width: 1920,
      height: 1080,
      fonts: [t.display, t.text],
    },
  })
}

function buildStack(t: Tokens, hero: string, headline: string, total: number, seconds: number): GoldenStarter {
  const H = heroSize(hero)
  const S = subSize(headline)
  const e1 = Math.min(72, Math.round(total * 0.45))
  const c0 = 12 + 30
  const b0 = total - 46
  const b1 = total - 16
  const e1s = (e1 / 30).toFixed(2)
  const html = [
    depthHtml(),
    `<div class="hero" id="hero">`,
    `  <div class="kicker" id="kicker">${esc(t.kicker)}</div>`,
    `  <div class="hero-line" id="heroLine"></div>`,
    `  <div class="sub-line" id="subLine"></div>`,
    `  <div class="bar" id="bar"></div>`,
    `</div>`,
    `<div class="badge" id="badge">${esc(t.badge)}</div>`,
    chromeHtml(),
  ].join("\n")
  const css = [
    baseCss(t),
    `.hero{position:absolute;left:50%;top:44%;text-align:center;width:1600px;z-index:10}`,
    `.hero-line{margin-top:18px;font-size:${H}px;line-height:1;font-weight:800;font-family:'${t.display}',sans-serif;color:${t.ink};text-shadow:0 24px 80px rgba(0,0,0,0.45)}`,
    `.hero-line span{display:inline-block}`,
    `.sub-line{margin-top:26px;font-size:${S}px;line-height:1.35;font-family:'${t.text}',sans-serif;color:${t.ink}}`,
    `.sub-line span{display:inline-block;margin-right:14px}`,
    `.bar{height:6px;background:${t.accent};margin:30px auto 0}`,
  ].join("\n")
  const js = [
    `function init(ctx) {`,
    `  var hero = ${JSON.stringify(hero)}.split("");`,
    `  var line = ctx.el("heroLine");`,
    `  for (var i = 0; i < hero.length; i++) { var s = document.createElement("span"); s.textContent = hero[i] === " " ? "\\u00A0" : hero[i]; line.appendChild(s); }`,
    `  var words = ${JSON.stringify(headline)}.split(" ");`,
    `  var sub = ctx.el("subLine");`,
    `  for (var j = 0; j < words.length; j++) { var w = document.createElement("span"); w.textContent = words[j]; sub.appendChild(w); }`,
    `}`,
    `function render(t, ctx) {`,
    `  var f = ctx.frame;`,
    `  // Beat 1 — anticipation: dip before the entrance.`,
    `  var anticipate = ctx.interpolate(f, [0, 15], [1, 0.94], { easing: ctx.Easing.easeIn });`,
    `  // Beat 2 — hero entrance with spring settle.`,
    `  var land = ctx.spring(t - 15 / 30, { damping: ${t.damping}, mass: 0.8, stiffness: 130 });`,
    `  var zoom = f < 15 ? anticipate : 0.94 + land * 0.06;`,
    `  var rise = ctx.interpolate(f, [15, ${e1}], [54, 0], { easing: ctx.Easing.easeOut });`,
    `  var fade = ctx.interpolate(f, [15, 32], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var bar = ctx.interpolate(f, [${c0}, ${c0 + 30}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var badgeIn = ctx.interpolate(f, [${b0}, ${b1}], [0, 1], { easing: ctx.Easing.easeOut });`,
    ...depthJs(total, e1),
    `  var heroEl = ctx.el("hero");`,
    `  heroEl.style.translate = "-50% " + (rise + breathe) + "px";`,
    `  heroEl.style.scale = String(zoom * push);`,
    `  heroEl.style.opacity = fade;`,
    `  ctx.el("kicker").style.letterSpacing = track + "px";`,
    `  var chars = ctx.el("heroLine").children;`,
    `  for (var i = 0; i < chars.length; i++) {`,
    `    var d = 15 + i * 2;`,
    `    var s = ctx.spring(t - d / 30, { damping: 16, mass: 0.5, stiffness: 200 });`,
    `    chars[i].style.translate = "0 " + ctx.interpolate(f, [d, d + 16], [70, 0], { easing: ctx.Easing.easeOut }) + "px";`,
    `    chars[i].style.opacity = Math.max(0, Math.min(1, s));`,
    `  }`,
    `  var words = ctx.el("subLine").children;`,
    `  for (var k = 0; k < words.length; k++) {`,
    `    var d2 = ${c0} + k * 4;`,
    `    var s2 = ctx.spring(t - d2 / 30, { damping: 18, mass: 0.5, stiffness: 180 });`,
    `    words[k].style.translate = "0 " + ctx.interpolate(f, [d2, d2 + 18], [22, 0], { easing: ctx.Easing.easeOut }) + "px";`,
    `    words[k].style.opacity = Math.max(0, Math.min(1, s2));`,
    `  }`,
    `  ctx.el("bar").style.width = (8 + bar * 140) + "px";`,
    `  var badge = ctx.el("badge");`,
    `  badge.style.translate = "-50% " + counter + "px";`,
    `  badge.style.opacity = badgeIn;`,
    ...depthApply(),
    ...chromeJs(total),
    `  void ${e1s};`,
    `}`,
  ].join("\n")
  return {
    code: bundleOf(t, `${hero} — center-stack ${t.palette}`, html, css, js, seconds),
    plan: {
      title: `${hero} — center-stack ${t.palette}`,
      intent: `Anticipation dip, spring hero landing, staggered sub cascade, resolved hold. ${t.palette} stage, ${t.display}/${t.text}.`,
      beats: [
        { from: 0, to: 15, what: "anticipation compress scale 1→0.94, easeIn" },
        { from: 15, to: e1, what: `hero entrance translateY 54→0 + spring settle (damping ${t.damping})` },
        { from: c0, to: c0 + 60, what: "sub cascade per-word spring stagger 4f, overlapping the settle" },
        { from: b0, to: total, what: "accent bar wipe + badge resolve, idle breathing hold" },
      ],
      ending: "Hero and sub resolved, badge held.",
    },
  }
}

function buildSplit(t: Tokens, hero: string, headline: string, total: number, seconds: number): GoldenStarter {
  const H = Math.min(150, heroSize(hero) + 10)
  const S = subSize(headline)
  const e1 = Math.min(72, Math.round(total * 0.45))
  const c0 = 12 + 28
  const b0 = total - 46
  const b1 = total - 16
  const html = [
    depthHtml(),
    `<div class="grid"></div>`,
    `<div class="rail" id="rail">`,
    `  <div class="kicker" id="kicker">${esc(t.kicker)}</div>`,
    `  <div class="rail-hero">${esc(hero)}</div>`,
    `  <div class="rail-sub" id="subLine"></div>`,
    `</div>`,
    `<div class="emblem" id="emblem"><div class="ring" id="ring"></div><div class="core" id="core"></div><svg class="play" viewBox="0 0 24 24" width="150" height="150"><polygon points="7,4 20,12 7,20" fill="${t.accent}"/></svg></div>`,
    `<div class="badge" id="badge">${esc(t.badge)}</div>`,
    chromeHtml(),
  ].join("\n")
  const css = [
    baseCss(t),
    `.grid{position:absolute;left:-24px;top:-24px;right:-24px;bottom:-24px;background:repeating-linear-gradient(90deg,transparent 0 118px,${t.accent}14 118px 120px);z-index:1}`,
    `.rail{position:absolute;left:160px;top:50%;width:980px;z-index:10;text-align:left}`,
    `.rail-hero{font-size:${H}px;line-height:1;font-weight:800;font-family:'${t.display}',sans-serif;color:${t.ink};margin-top:18px;text-shadow:0 24px 80px rgba(0,0,0,0.45)}`,
    `.rail-sub{margin-top:26px;font-size:${S}px;line-height:1.35;font-family:'${t.text}',sans-serif;color:${t.ink}}`,
    `.rail-sub span{display:inline-block;margin-right:14px}`,
    `.emblem{position:absolute;right:220px;top:50%;width:480px;height:480px;z-index:6}`,
    `.ring{position:absolute;inset:0;border-radius:50%;border:3px dashed ${t.accent}66}`,
    `.core{position:absolute;left:140px;top:140px;width:200px;height:200px;border-radius:50%;background:${t.accent}22}`,
    `.play{position:absolute;left:0;top:0;width:480px;height:480px;display:flex}`,
    `.play{position:absolute;inset:0;margin:auto}`,
  ].join("\n")
  const js = [
    `function init(ctx) {`,
    `  var words = ${JSON.stringify(headline)}.split(" ");`,
    `  var sub = ctx.el("subLine");`,
    `  for (var j = 0; j < words.length; j++) { var w = document.createElement("span"); w.textContent = words[j]; sub.appendChild(w); }`,
    `}`,
    `function render(t, ctx) {`,
    `  var f = ctx.frame;`,
    `  var anticipate = ctx.interpolate(f, [0, 15], [1, 0.95], { easing: ctx.Easing.easeIn });`,
    `  var land = ctx.spring(t - 15 / 30, { damping: ${t.damping}, mass: 0.8, stiffness: 130 });`,
    `  var lift = ctx.interpolate(f, [15, ${e1}], [60, -150], { easing: ctx.Easing.easeOut });`,
    `  var fade = ctx.interpolate(f, [15, 32], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var pop = ctx.interpolate(f, [20, ${e1}], [0.5, 1], { easing: ctx.Easing.easeOut });`,
    `  var spin = ctx.interpolate(f, [20, ${e1 + 40}], [0, 12], { easing: ctx.Easing.easeOut });`,
    `  var badgeIn = ctx.interpolate(f, [${b0}, ${b1}], [0, 1], { easing: ctx.Easing.easeOut });`,
    ...depthJs(total, e1),
    `  var rail = ctx.el("rail");`,
    `  rail.style.translate = "0 " + (lift + breathe) + "px";`,
    `  rail.style.scale = String((f < 15 ? anticipate : 0.95 + land * 0.05) * push);`,
    `  rail.style.opacity = fade;`,
    `  ctx.el("kicker").style.letterSpacing = track + "px";`,
    `  var words = ctx.el("subLine").children;`,
    `  for (var k = 0; k < words.length; k++) {`,
    `    var d = ${c0} + k * 4;`,
    `    var s = ctx.spring(t - d / 30, { damping: 18, mass: 0.5, stiffness: 180 });`,
    `    words[k].style.translate = "0 " + ctx.interpolate(f, [d, d + 18], [22, 0], { easing: ctx.Easing.easeOut }) + "px";`,
    `    words[k].style.opacity = Math.max(0, Math.min(1, s));`,
    `  }`,
    `  var emb = ctx.el("emblem");`,
    `  emb.style.translate = "0 " + (-240 + breathe * 2) + "px";`,
    `  ctx.el("ring").style.rotate = spin + "deg";`,
    `  ctx.el("core").style.scale = String(pop);`,
    `  ctx.el("core").style.opacity = fade;`,
    `  var badge = ctx.el("badge");`,
    `  badge.style.translate = "-50% " + counter + "px";`,
    `  badge.style.opacity = badgeIn;`,
    ...depthApply(),
    ...chromeJs(total),
    `}`,
  ].join("\n")
  return {
    code: bundleOf(t, `${hero} — split ${t.palette}`, html, css, js, seconds),
    plan: {
      title: `${hero} — split ${t.palette}`,
      intent: `Text rail slides in left with spring settle while the emblem pops right with counter-rotation. ${t.palette} stage, ${t.display}/${t.text}.`,
      beats: [
        { from: 0, to: 15, what: "stage-wide anticipation compress, easeIn" },
        { from: 15, to: e1, what: "text rail translate in + emblem pop with 12° counter-rotation" },
        { from: c0, to: c0 + 60, what: "sub cascade per-word spring stagger 4f" },
        { from: b0, to: total, what: "badge resolve, idle breathing hold" },
      ],
      ending: "Rail and emblem resolved, badge held.",
    },
  }
}

function buildMask(t: Tokens, hero: string, headline: string, total: number, seconds: number): GoldenStarter {
  const H = Math.min(200, heroSize(hero) + 24)
  const S = subSize(headline)
  const m0 = 10
  const m1 = m0 + 44
  const c0 = m0 + 30
  const b0 = total - 46
  const b1 = total - 16
  const html = [
    depthHtml(),
    `<div class="kicker-top" id="kicker">${esc(t.kicker)}</div>`,
    `<div class="center" id="center">`,
    `  <div class="clip" id="clip"><div class="mask-hero" id="maskHero"></div></div>`,
    `  <div class="sub-line" id="subLine"></div>`,
    `  <div class="bar" id="bar"></div>`,
    `</div>`,
    `<div class="badge" id="badge">${esc(t.badge)}</div>`,
    chromeHtml(),
  ].join("\n")
  const css = [
    baseCss(t),
    `.kicker-top{position:absolute;left:50%;top:120px;transform:translateX(-50%);font-size:24px;color:${t.accent};font-family:'${t.text}',sans-serif;z-index:11;white-space:nowrap}`,
    `.center{position:absolute;left:50%;top:42%;text-align:center;width:1700px;z-index:10}`,
    `.clip{overflow:hidden}`,
    `.mask-hero{font-size:${H}px;line-height:1;font-family:'${t.display}',sans-serif;color:${t.ink}}`,
    `.mask-hero span{display:inline-block}`,
    `.sub-line{margin-top:30px;font-size:${S}px;line-height:1.35;font-family:'${t.text}',sans-serif;color:${t.ink}}`,
    `.sub-line span{display:inline-block;margin-right:14px}`,
    `.bar{height:6px;background:${t.accent};margin:30px auto 0}`,
  ].join("\n")
  const js = [
    `function init(ctx) {`,
    `  var chars = ${JSON.stringify(hero.toUpperCase())}.split("");`,
    `  var mh = ctx.el("maskHero");`,
    `  for (var i = 0; i < chars.length; i++) { var s = document.createElement("span"); s.textContent = chars[i] === " " ? "\\u00A0" : chars[i]; mh.appendChild(s); }`,
    `  var words = ${JSON.stringify(headline)}.split(" ");`,
    `  var sub = ctx.el("subLine");`,
    `  for (var j = 0; j < words.length; j++) { var w = document.createElement("span"); w.textContent = words[j]; sub.appendChild(w); }`,
    `}`,
    `function render(t, ctx) {`,
    `  var f = ctx.frame;`,
    `  var mask = ctx.interpolate(f, [${m0}, ${m1}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var kickerIn = ctx.interpolate(f, [0, 22], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var bar = ctx.interpolate(f, [${m1}, ${m1 + 26}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var badgeIn = ctx.interpolate(f, [${b0}, ${b1}], [0, 1], { easing: ctx.Easing.easeOut });`,
    ...depthJs(total, m1),
    `  ctx.el("kicker").style.opacity = kickerIn;`,
    `  ctx.el("kicker").style.letterSpacing = track + "px";`,
    `  ctx.el("clip").style.clipPath = "inset(0 " + ((1 - mask) * 100) + "% 0 0)";`,
    `  var chars = ctx.el("maskHero").children;`,
    `  for (var i = 0; i < chars.length; i++) {`,
    `    var d = ${m0} + i * 2;`,
    `    var s = ctx.spring(t - d / 30, { damping: 16, mass: 0.5, stiffness: 200 });`,
    `    chars[i].style.translate = "0 " + ctx.interpolate(f, [d, d + 14], [60, 0], { easing: ctx.Easing.easeOut }) + "px";`,
    `    chars[i].style.opacity = Math.max(0, Math.min(1, s));`,
    `  }`,
    `  var words = ctx.el("subLine").children;`,
    `  for (var k = 0; k < words.length; k++) {`,
    `    var d2 = ${c0} + k * 5;`,
    `    var s2 = ctx.spring(t - d2 / 30, { damping: 18, mass: 0.5, stiffness: 180 });`,
    `    words[k].style.opacity = Math.max(0, Math.min(1, s2));`,
    `  }`,
    `  ctx.el("bar").style.width = (8 + bar * 160) + "px";`,
    `  var center = ctx.el("center");`,
    `  center.style.translate = "-50% " + breathe + "px";`,
    `  center.style.scale = String(push);`,
    `  var badge = ctx.el("badge");`,
    `  badge.style.translate = "-50% " + counter + "px";`,
    `  badge.style.opacity = badgeIn;`,
    ...depthApply(),
    ...chromeJs(total),
    `}`,
  ].join("\n")
  return {
    code: bundleOf(t, `${hero} — kinetic mask ${t.palette}`, html, css, js, seconds),
    plan: {
      title: `${hero} — kinetic mask ${t.palette}`,
      intent: `Clip-path hero wipe with per-character springs, word cascade sub, resolved hold. ${t.palette} stage, ${t.display}/${t.text}.`,
      beats: [
        { from: m0, to: m1, what: "hero mask wipe inset 100→0% with per-char spring stagger 2f" },
        { from: c0, to: c0 + 60, what: "sub cascade per-word spring stagger 5f, overlapping the wipe" },
        { from: b0, to: total, what: "accent bar + badge resolve, idle breathing hold" },
      ],
      ending: "Full hero revealed, sub resolved, badge held.",
    },
  }
}

function buildCode(t: Tokens, hero: string, headline: string, total: number, seconds: number): GoldenStarter {
  const rawFn = (hero.replace(/[^A-Za-z0-9_]/g, "") || "Nova").slice(0, 24)
  const fn = /^[0-9]/.test(rawFn) ? `App${rawFn}` : rawFn
  const comment = `// ${headline.replace(/\s+/g, " ").slice(0, 52)}`
  const cmd = `$ npx webmotion render ${fn}`
  const title = hero.replace(/"/g, "'").slice(0, 28)
  const lines: Array<Array<{ t: string; c: string }>> = [
    [{ t: "import", c: t.accent }, { t: " { spring } ", c: t.ink }, { t: "from", c: t.accent }, { t: ' "webmotion"', c: "#9CE56B" }],
    [{ t: comment, c: "#5B616B" }],
    [{ t: "export ", c: t.accent }, { t: "default ", c: t.accent }, { t: "function ", c: t.accent }, { t: fn, c: t.accent }, { t: "() {", c: t.ink }],
    [{ t: "  return <", c: t.ink }, { t: "Intro", c: t.ink }, { t: " title=", c: t.ink }, { t: `"${title}"`, c: "#9CE56B" }, { t: " />", c: t.ink }],
    [{ t: "}", c: t.ink }],
  ]
  const firstLine = 26
  const perLine = 16
  const lastIdx = 5
  const typeStart = firstLine + lastIdx * perLine + 12
  const typeDur = Math.min(48, Math.max(24, total - typeStart - 40))
  const settleAt = typeStart + typeDur
  const b0 = total - 46
  const b1 = total - 16
  const html = [
    depthHtml(),
    `<div class="kicker-top mono" id="kicker">${esc(t.kicker)}</div>`,
    `<div class="term" id="term">`,
    `  <div class="term-bar"><i class="r"></i><i class="y"></i><i class="g"></i><span class="term-title">${esc(fn)}.js</span></div>`,
    `  <div class="term-body" id="termBody"></div>`,
    `  <div class="term-foot"><span>main</span><span class="right">rendered in code</span></div>`,
    `</div>`,
    `<div class="badge mono" id="badge">${esc(t.badge)}</div>`,
    chromeHtml(),
  ].join("\n")
  const css = [
    baseCss(t),
    `.mono{font-family:'Space Mono',monospace}`,
    `.kicker-top{position:absolute;left:50%;top:150px;transform:translateX(-50%);font-size:24px;color:${t.accent};z-index:11;white-space:nowrap}`,
    `.term{position:absolute;left:50%;top:44%;width:1400px;border-radius:20px;border:1px solid ${t.accent}44;background:rgba(0,0,0,0.38);z-index:10}`,
    `.term-bar{display:flex;align-items:center;gap:12px;padding:0 28px;height:64px;border-bottom:1px solid ${t.accent}22}`,
    `.term-bar i{width:18px;height:18px;border-radius:50%}`,
    `.term-bar .r{background:#FF5F57}.term-bar .y{background:#FEBC2E}.term-bar .g{background:#28C840}`,
    `.term-title{margin-left:14px;font-size:24px;color:${t.ink};font-family:'Space Mono',monospace}`,
    `.term-body{padding:8px 0}`,
    `.code-line{display:flex;align-items:center;height:56px;padding:0 28px;font-size:30px;line-height:1.2;font-family:'Space Mono',monospace}`,
    `.code-line .ln{width:56px;font-size:24px;color:#5B616B;flex:none}`,
    `.term-foot{display:flex;align-items:center;gap:10px;padding:0 28px;height:52px;border-top:1px solid ${t.accent}22;font-size:22px;font-family:'Space Mono',monospace;color:#5B616B}`,
    `.term-foot .right{margin-left:auto;color:${t.ink}}`,
  ].join("\n")
  const js = [
    `var LINES = ${JSON.stringify(lines)};`,
    `var CMD = ${JSON.stringify(cmd)};`,
    `function init(ctx) {`,
    `  var body = ctx.el("termBody");`,
    `  for (var i = 0; i < LINES.length; i++) {`,
    `    var row = document.createElement("div"); row.className = "code-line";`,
    `    var ln = document.createElement("span"); ln.className = "ln"; ln.textContent = String(i + 1).padStart(2, "0");`,
    `    var code = document.createElement("span");`,
    `    for (var j = 0; j < LINES[i].length; j++) { var tk = document.createElement("span"); tk.style.color = LINES[i][j].c; tk.textContent = LINES[i][j].t; code.appendChild(tk); }`,
    `    row.appendChild(ln); row.appendChild(code); body.appendChild(row);`,
    `  }`,
    `  var cmd = document.createElement("div"); cmd.className = "code-line"; cmd.id = "cmdLine";`,
    `  cmd.innerHTML = '<span class="ln">06</span><span id="cmdText"></span><span id="cursor">\\u258D</span>';`,
    `  body.appendChild(cmd);`,
    `}`,
    `function render(t, ctx) {`,
    `  var f = ctx.frame;`,
    `  var winIn = ctx.spring(t - 8 / 30, { damping: 18, mass: 0.9, stiffness: 120 });`,
    `  var winClamped = Math.max(0, Math.min(1, winIn));`,
    `  var winY = ctx.interpolate(f, [8, 52], [90, 0], { easing: ctx.Easing.easeOut });`,
    `  var winFade = ctx.interpolate(f, [8, 26], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var badgeIn = ctx.interpolate(f, [${b0}, ${b1}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var active = Math.min(${lastIdx}, Math.max(0, Math.floor((f - ${firstLine}) / ${perLine})));`,
    `  var typedN = Math.floor(ctx.interpolate(f, [${typeStart}, ${typeStart + typeDur}], [0, CMD.length]));`,
    `  var cursorOn = Math.floor(f / 14) % 2 === 0;`,
    ...depthJs(total, settleAt),
    `  ctx.el("kicker").style.letterSpacing = track + "px";`,
    `  ctx.el("kicker").style.opacity = winFade;`,
    `  var term = ctx.el("term");`,
    `  term.style.translate = "-50% " + (winY + breathe) + "px";`,
    `  term.style.scale = String((0.92 + 0.08 * winClamped) * push);`,
    `  term.style.opacity = winFade;`,
    `  var rows = ctx.el("termBody").children;`,
    `  for (var i = 0; i < LINES.length; i++) {`,
    `    var d = ${firstLine} + i * ${perLine};`,
    `    var s = ctx.spring(t - d / 30, { damping: 18, mass: 0.5, stiffness: 180 });`,
    `    rows[i].style.translate = "0 " + ctx.interpolate(f, [d, d + 14], [24, 0], { easing: ctx.Easing.easeOut }) + "px";`,
    `    rows[i].style.opacity = Math.max(0, Math.min(1, s));`,
    `    rows[i].style.backgroundColor = i === active ? "${t.accent}26" : "transparent";`,
    `  }`,
    `  ctx.el("cmdText").textContent = CMD.slice(0, typedN);`,
    `  ctx.el("cursor").style.opacity = cursorOn ? 1 : 0;`,
    `  ctx.el("cursor").style.color = "${t.accent}";`,
    `  var badge = ctx.el("badge");`,
    `  badge.style.translate = "-50% " + counter + "px";`,
    `  badge.style.opacity = badgeIn;`,
    ...depthApply(),
    ...chromeJs(total),
    `}`,
  ].join("\n")
  return {
    code: serializeBundle({
      version: 1,
      html,
      css,
      js,
      meta: { title: `${hero} — code terminal`, duration: seconds, fps: 30, width: 1920, height: 1080, fonts: ["Space Mono", t.text] },
    }),
    plan: {
      title: `${hero} — code terminal ${t.palette}`,
      intent: `Terminal springs in, token-coloured lines cascade with per-line springs, the highlight follows the active line, the render command types itself with a blinking cursor. ${t.palette} stage, Space Mono.`,
      beats: [
        { from: 8, to: 52, what: "terminal window spring entrance scale 0.92→1 + rise 90→0, easeOut" },
        { from: firstLine, to: firstLine + 5 * perLine, what: "code line cascade per-line spring stagger 16f with active-line highlight sweep" },
        { from: typeStart, to: typeStart + typeDur, what: "command typing via slice + deterministic cursor blink, overlapping the settle" },
        { from: total - 46, to: total, what: "badge resolve, idle breathing hold" },
      ],
      ending: "Full file revealed, command typed, badge held.",
    },
  }
}

function buildOverlay(t: Tokens, hero: string, headline: string, total: number, seconds: number): GoldenStarter {
  const H = Math.min(120, heroSize(hero))
  const S = subSize(headline)
  const w0 = 8
  const w1 = w0 + 26
  const n0 = w0 + 12
  const c0 = n0 + 26
  const x0 = Math.max(60, total - 40)
  const x1 = Math.max(90, total - 10)
  const b0 = total - 46
  const b1 = total - 16
  const html = [
    depthHtml(),
    `<div class="lower" id="lower">`,
    `  <div class="rule" id="rule"></div>`,
    `  <div>`,
    `    <div class="guest">GUEST</div>`,
    `    <div class="clip"><div class="name" id="nameEl"></div></div>`,
    `    <div class="role" id="roleEl"></div>`,
    `  </div>`,
    `</div>`,
    `<div class="badge" id="badge">${esc(t.badge)}</div>`,
    chromeHtml(),
  ].join("\n")
  const css = [
    baseCss(t),
    `.lower{position:absolute;left:160px;bottom:180px;z-index:10;display:flex;align-items:stretch;gap:28px}`,
    `.rule{width:10px;background:${t.accent}}`,
    `.guest{font-size:24px;color:${t.accent};font-family:'${t.text}',sans-serif}`,
    `.clip{overflow:hidden}`,
    `.name{font-size:${H}px;line-height:1;font-weight:800;font-family:'${t.display}',sans-serif;color:${t.ink}}`,
    `.name span{display:inline-block}`,
    `.role{margin-top:18px;font-size:${S}px;line-height:1.35;font-family:'${t.text}',sans-serif;color:${t.ink}}`,
    `.role span{display:inline-block;margin-right:14px}`,
  ].join("\n")
  const js = [
    `function init(ctx) {`,
    `  var chars = ${JSON.stringify(hero.toUpperCase())}.split("");`,
    `  var ne = ctx.el("nameEl");`,
    `  for (var i = 0; i < chars.length; i++) { var s = document.createElement("span"); s.textContent = chars[i] === " " ? "\\u00A0" : chars[i]; ne.appendChild(s); }`,
    `  var words = ${JSON.stringify(headline)}.split(" ");`,
    `  var ro = ctx.el("roleEl");`,
    `  for (var j = 0; j < words.length; j++) { var w = document.createElement("span"); w.textContent = words[j]; ro.appendChild(w); }`,
    `}`,
    `function render(t, ctx) {`,
    `  var f = ctx.frame;`,
    `  var bar = ctx.interpolate(f, [${w0}, ${w1}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var slide = ctx.interpolate(f, [${w0}, ${w1 + 24}], [-160, 0], { easing: ctx.Easing.easeOut });`,
    `  var fade = ctx.interpolate(f, [${w0}, ${w0 + 16}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var mask = ctx.interpolate(f, [${n0}, ${n0 + 40}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var rule = ctx.interpolate(f, [${c0}, ${c0 + 24}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var badgeIn = ctx.interpolate(f, [${b0}, ${b1}], [0, 1], { easing: ctx.Easing.easeOut });`,
    `  var exit = ctx.interpolate(f, [${x0}, ${x1}], [0, 1], { easing: ctx.Easing.easeIn });`,
    ...depthJs(total, n0 + 40),
    `  var lower = ctx.el("lower");`,
    `  lower.style.translate = "0 " + (slide + exit * 60 + breathe) + "px";`,
    `  lower.style.scale = String(push);`,
    `  lower.style.opacity = fade * (1 - exit);`,
    `  ctx.el("rule").style.height = (40 + bar * 150) + "px";`,
    `  var chars = ctx.el("nameEl").children;`,
    `  for (var i = 0; i < chars.length; i++) {`,
    `    var d = ${n0} + i * 2;`,
    `    var s = ctx.spring(t - d / 30, { damping: 16, mass: 0.5, stiffness: 200 });`,
    `    chars[i].style.translate = "0 " + ctx.interpolate(f, [d, d + 14], [50, 0], { easing: ctx.Easing.easeOut }) + "px";`,
    `    chars[i].style.opacity = Math.max(0, Math.min(1, s));`,
    `  }`,
    `  ctx.el("nameEl").parentElement.style.clipPath = "inset(0 " + ((1 - mask) * 100) + "% 0 0)";`,
    `  var words = ctx.el("roleEl").children;`,
    `  for (var k = 0; k < words.length; k++) {`,
    `    var d2 = ${c0} + k * 5;`,
    `    var s2 = ctx.spring(t - d2 / 30, { damping: 18, mass: 0.5, stiffness: 180 });`,
    `    words[k].style.opacity = Math.max(0, Math.min(1, s2 * rule));`,
    `  }`,
    `  var badge = ctx.el("badge");`,
    `  badge.style.translate = "-50% " + counter + "px";`,
    `  badge.style.opacity = badgeIn;`,
    ...depthApply(),
    ...chromeJs(total),
    `}`,
  ].join("\n")
  return {
    code: bundleOf(t, `${hero} — lower third ${t.palette}`, html, css, js, seconds),
    plan: {
      title: `${hero} — lower third ${t.palette}`,
      intent: `Accent bar wipe with riding entrance, masked name cascade, role stagger, full lockup exit. ${t.palette} stage, ${t.display}/${t.text}.`,
      beats: [
        { from: w0, to: w1 + 24, what: "accent bar wipe down + lockup ride-in translateX -160→0" },
        { from: n0, to: n0 + 40, what: "name mask wipe with per-char spring stagger 2f" },
        { from: c0, to: c0 + 60, what: "role cascade per-word spring stagger 5f under a rule wipe" },
        { from: x0, to: total, what: "full lockup exit slide + fade — lower-thirds leave" },
      ],
      ending: "Lockup exited, badge held to the end.",
    },
  }
}

/** Designed starter: palette + fonts + layout from the brief, zero errors by construction. */
export function goldenStarter(context: StarterContext = {}): GoldenStarter {
  const product = (context.product ?? context.brand ?? "SlyxUp").slice(0, 40) || "SlyxUp"
  const headline = (context.headline ?? "Motion that lands").slice(0, 140) || "Motion that lands"
  const seconds = Math.min(30, Math.max(2, Math.round(context.seconds ?? 5)))
  const t = tokensFor(context.mood)
  const seed = hashSeed(`${product}|${headline}|${t.palette}`)
  const variant = seed % 3
  const total = Math.min(900, Math.max(90, seconds * 30))
  const framing = (context.framing ?? "landscape").toLowerCase()
  const frameNote =
    framing.includes("vertical") || framing.includes("9:16")
      ? " Center-safe: keep the action in the middle 1080px for the 9:16 crop."
      : framing.includes("square") || framing.includes("1:1")
        ? " Center-safe: keep the action in the middle 1080px square."
        : ""
  const hay = `${product} ${headline} ${context.mood ?? ""}`
  const base = /code|typewriter|typing|coding|developer|terminal|snippet|hackathon|software|api\b|sdk|npm|git\b|\bjs\b|javascript/i.test(hay)
    ? buildCode(t, product, headline, total, seconds)
    : /lower.?third|chyron|name.?tag|speaker|title.?card|interview/i.test(hay)
      ? buildOverlay(t, product, headline, total, seconds)
      : variant === 0
        ? buildStack(t, product, headline, total, seconds)
        : variant === 1
          ? buildSplit(t, product, headline, total, seconds)
          : buildMask(t, product, headline, total, seconds)
  return {
    code: base.code,
    plan: { ...base.plan, intent: base.plan.intent + frameNote },
  }
}
