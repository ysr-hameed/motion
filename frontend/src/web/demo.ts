/**
 * Hand-written web bundle, used by `?demo=1` and as the agent's reference.
 *
 * This goes through the identical iframe pipeline the agent writes to
 * (buildSrcdoc → sandboxed render → audit), so the demo doubles as a smoke
 * test: if this stops rendering, the runtime is broken and it shows up
 * immediately rather than being blamed on whatever the model wrote.
 *
 * Motion on display: anticipation dip, spring overshoot landing, masked
 * headline reveal, staggered rule ticks — every move a pure function of t.
 */

import { serializeBundle } from "./types"

const html = `
<div class="glow"></div>
<div class="logo" id="logo"><div class="mark"></div><div class="word">SlyxUp</div></div>
<div class="mask"><div class="row" id="headline"></div></div>
<div class="rule" id="rule"></div>
`.trim()

const css = `
#wm-stage{background:#0E0F13;font-family:'Space Grotesk',sans-serif;overflow:hidden}
.glow{position:absolute;left:50%;top:40%;width:1200px;height:700px;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(255,179,64,.10),transparent 70%);z-index:1}
.logo{position:absolute;left:50%;top:38%;display:flex;align-items:center;gap:18px;z-index:10}
.mark{width:74px;height:74px;border-radius:18px;background:#FFB340;flex:none}
.word{font-size:68px;font-weight:700;color:#E8EAF0;letter-spacing:-.03em}
.mask{position:absolute;left:50%;top:58%;transform:translateX(-50%);overflow:hidden;height:92px;padding:0 4px;z-index:10}
.row{display:flex;align-items:center;height:100%;white-space:pre}
.row span{display:inline-block;font-size:64px;line-height:1.1;font-weight:600;color:#E8EAF0;letter-spacing:-.02em;white-space:pre}
.rule{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);display:flex;gap:6px;z-index:10}
.rule i{display:block;width:26px;height:3px}
`.trim()

const js = `
function render(t, ctx) {
  var f = t * ctx.fps;
  // Anticipation: pull back slightly before the move (0-8f), then release.
  var anticipate = ctx.interpolate(f, [0, 8, 20], [-0.14, -0.2, 0], { easing: ctx.Easing.easeIn });
  // Arrival: spring overshooting past 1 and settling (damping 9 = bouncy).
  var pop = ctx.spring(f / ctx.fps - 8 / ctx.fps, { damping: 9, mass: 0.7, stiffness: 120 });
  var popC = Math.max(0, Math.min(1.4, pop));
  var opacity = ctx.interpolate(f, [6, 18], [0, 1]);
  var logo = ctx.el("logo");
  logo.style.transform = "translate(-50%,-50%) scale(" + (anticipate + popC * 0.86) + ")";
  logo.style.opacity = opacity;
  var mark = logo.querySelector(".mark");
  mark.style.transform = "rotate(" + popC * 12 + "deg)";

  // Headline: masked row slides in from the right while words stagger up.
  var words = ["Motion ", "that ", "lands"];
  var row = ctx.el("headline");
  if (row.childElementCount !== words.length) {
    row.innerHTML = "";
    for (var i = 0; i < words.length; i++) {
      var s = document.createElement("span");
      s.textContent = words[i];
      row.appendChild(s);
    }
  }
  var rulePct = ctx.interpolate(f, [26, 52], [1, 0], { easing: ctx.Easing.easeOut });
  row.style.transform = "translateX(" + rulePct * 100 + "%)";
  var spans = row.children;
  for (var k = 0; k < spans.length; k++) {
    var enter = ctx.spring(f / ctx.fps - (26 + k * 4) / ctx.fps, { damping: 200, mass: 1, stiffness: 120 });
    var lift = ctx.interpolate(enter, [0, 1], [18, 0]);
    var fade = ctx.interpolate(enter, [0, 1], [0, 1]);
    spans[k].style.transform = "translateY(" + lift + "px)";
    spans[k].style.opacity = fade;
  }

  // Colour rule ticks on with a stagger.
  var rule = ctx.el("rule");
  var colors = ["#FFB340", "#5AC8FA", "#7DDC8B", "#FF7A7A", "#E8EAF0"];
  if (rule.childElementCount !== colors.length) {
    rule.innerHTML = "";
    for (var j = 0; j < colors.length; j++) {
      var tick = document.createElement("i");
      tick.style.background = colors[j];
      rule.appendChild(tick);
    }
  }
  for (var m = 0; m < colors.length; m++) {
    var on = ctx.interpolate(f, [34 + m * 5, 40 + m * 5], [0, 1]);
    rule.children[m].style.opacity = on;
    rule.children[m].style.transform = "scaleX(" + (0.4 + on * 0.6) + ")";
  }
}
`.trim()

export const DEMO_BUNDLE_JSON = serializeBundle({
  version: 1,
  html,
  css,
  js,
  meta: { title: "Product Reveal", duration: 5, fps: 30, width: 1920, height: 1080, fonts: ["Space Grotesk"] },
})

export const DEMO_PLAN = {
  title: "Product Reveal",
  intent: "A logo springs into place with overshoot while a headline masks in beneath it.",
  beats: [
    { from: 0, to: 8, what: "empty dark stage" },
    { from: 8, to: 26, what: "logo springs in from small, overshooting past 1" },
    { from: 26, to: 48, what: "headline masks in per word, overlapping the settle" },
    { from: 48, to: 90, what: "rule of colour ticks on, hold" },
  ],
  ending: "Logo and headline resolved, colour rule settled.",
}
