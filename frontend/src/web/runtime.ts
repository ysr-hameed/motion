/**
 * Web motion runtime — helpers + iframe driver + srcdoc builder.
 *
 * The iframe document is fully self-contained: helper library (WM.*),
 * driver (clock, messaging, audit, export snapshots), font links, pinned
 * CDN assets, bundle CSS, bundle markup, bundle JS. No bundler, no
 * framework, no Remotion.
 *
 * Safety: the parent mounts this with sandbox="allow-scripts" and WITHOUT
 * allow-same-origin, so bundle JS runs in an opaque origin — no parent DOM,
 * no cookies, no storage. Parent/iframe talk only through postMessage.
 */

import { citedFamilies, type WebBundle } from "./types"
import { fontLinks } from "./fonts"

/* ── helper library (runs inside the iframe) ─────────────────────────── */

const RUNTIME_JS = `
"use strict";
/* WM motion helpers — deterministic pure functions of t (seconds). */
const WM = (() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;

  /* Cubic-bezier easing solver (Newton + bisection fallback). */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 5; i++) {
        const err = sx(t) - x;
        if (Math.abs(err) < 1e-4) return sy(t);
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= err / d;
      }
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 12; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-4) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }

  const Easing = {
    linear: (x) => x,
    easeIn: bezier(0.4, 0, 1, 1),
    easeOut: bezier(0.16, 1, 0.3, 1),
    easeInOut: bezier(0.65, 0, 0.35, 1),
    bezier: (x1, y1, x2, y2) => bezier(x1, y1, x2, y2),
  };

  /* Piecewise interpolation with clamping ON by default (safer than Remotion). */
  function interpolate(x, input, output, opts) {
    opts = opts || {};
    const easing = opts.easing || Easing.linear;
    const clampL = opts.clampLeft !== false && opts.extrapolateLeft !== "extend";
    const clampR = opts.clampRight !== false && opts.extrapolateRight !== "extend";
    const n = Math.min(input.length, output.length);
    if (n === 0) return output[0];
    if (n === 1) return output[0];
    if (x <= input[0]) {
      if (!clampL && n > 1) {
        const k = (x - input[0]) / (input[1] - input[0]);
        return output[0] + k * (output[1] - output[0]);
      }
      return output[0];
    }
    if (x >= input[n - 1]) {
      if (!clampR && n > 1) {
        const k = (x - input[n - 2]) / (input[n - 1] - input[n - 2]);
        return output[n - 1] + k * (output[n - 1] - output[n - 2]);
      }
      return output[n - 1];
    }
    let i = 0;
    while (i < n - 2 && x > input[i + 1]) i++;
    const k = easing((x - input[i]) / (input[i + 1] - input[i]));
    return lerp(output[i], output[i + 1], k);
  }

  /* Analytic damped spring: x'' = -(k/m)(x-to) - (c/m)x', x(0)=from, v(0)=0.
     t<0 returns "from", so delayed starts (t minus delay) hold pre-state. */
  function spring(t, cfg) {
    cfg = cfg || {};
    const from = cfg.from !== undefined ? cfg.from : 0;
    const to = cfg.to !== undefined ? cfg.to : 1;
    if (!(t > 0)) return from;
    const m = cfg.mass || 1;
    const k = cfg.stiffness !== undefined ? cfg.stiffness : 120;
    const c = cfg.damping !== undefined ? cfg.damping : 18;
    const w0 = Math.sqrt(k / m);
    const z = c / (2 * Math.sqrt(k * m));
    const d = to - from;
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      const e = Math.exp(-z * w0 * t);
      return to - d * e * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
    }
    const e = Math.exp(-w0 * t);
    return to - d * e * (1 + w0 * t);
  }

  /* Deterministic PRNG (mulberry32) — the Math.random replacement. */
  function hashSeed(s) {
    let h = 2166136261;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rand(seed) {
    let a = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return { clamp, lerp, bezier, Easing, interpolate, spring, rand };
})();
`

/* ── driver (clock, messaging, audit, export snapshots) ───────────────── */

const DRIVER_JS = `
"use strict";
(function () {
  const W = __W__, H = __H__, FPS = __FPS__, DURATION = __DUR__;
  const stage = document.getElementById("wm-stage");
  const viewport = document.getElementById("wm-viewport");
  let t = 0, playing = false, speed = 1, loop = false, raf = 0, last = 0;
  let userRender = null, userInit = null, booted = false;
  let citedFonts = [];
  let auditTimer = 0;

  function post(msg) {
    try { parent.postMessage(Object.assign({ ns: "wm" }, msg), "*"); } catch (e) {}
  }

  function fit() {
    if (!viewport || !stage) return;
    const s = Math.min(viewport.clientWidth / W, viewport.clientHeight / H);
    stage.style.transform = "scale(" + (s > 0 ? s : 1) + ")";
  }
  window.addEventListener("resize", fit);

  function el(id) { return document.getElementById(id); }
  function q(sel) { return stage ? stage.querySelector(sel) : null; }
  function qa(sel) { return stage ? Array.prototype.slice.call(stage.querySelectorAll(sel)) : []; }
  function ctxFor(time) {
    return {
      W: W, H: H, fps: FPS, duration: DURATION, t: time, frame: Math.round(time * FPS),
      clamp: WM.clamp, lerp: WM.lerp, interpolate: WM.interpolate,
      Easing: WM.Easing, spring: WM.spring, rand: WM.rand,
      el: el, q: q, qa: qa,
    };
  }

  function draw(time) {
    t = Math.min(DURATION, Math.max(0, time));
    if (userRender) {
      try { userRender(t, ctxFor(t)); }
      catch (err) {
        post({ ev: "report", phase: "runtime", ok: false, message: "runtime: " + (err && err.message ? err.message : String(err)) });
        userRender = null;
        return false;
      }
    }
    post({ ev: "tick", t: t, frame: Math.round(t * FPS) });
    scheduleAudit();
    return true;
  }

  function loopFn(now) {
    if (!playing) return;
    if (!last) last = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let nt = t + dt * speed;
    if (nt >= DURATION) {
      if (loop) nt = nt % DURATION;
      else { nt = DURATION; draw(nt); setPlaying(false); return; }
    }
    draw(nt);
    raf = requestAnimationFrame(loopFn);
  }
  function setPlaying(p) {
    if (p === playing) return;
    playing = p;
    last = 0;
    if (p) raf = requestAnimationFrame(loopFn);
    else if (raf) cancelAnimationFrame(raf);
  }

  /* Layout audit on settled frames — the browser-truth the agent waits for. */
  function scheduleAudit() {
    if (auditTimer) clearTimeout(auditTimer);
    auditTimer = setTimeout(runAudit, 1800);
  }
  function runAudit() {
    try {
      const findings = [];
      const r = stage.getBoundingClientRect();
      const scale = r.width / W;
      const boxes = [];
      const walker = document.createTreeWalker(stage, NodeFilter.SHOW_ELEMENT, null);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node instanceof Element)) continue;
        const cs = getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (Number(cs.opacity) < 0.05) continue;
        const hasText = Array.prototype.some.call(node.childNodes, (n) =>
          n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim().length > 0);
        if (!hasText && node.children.length > 0) continue;
        const b = node.getBoundingClientRect();
        if (b.width < 3 || b.height < 3) continue;
        const label = ((node.textContent || "").trim().replace(/\\s+/g, " ")).slice(0, 28);
        const size = parseFloat(cs.fontSize);
        boxes.push({
          label: label, left: Math.round((b.left - r.left) / scale), top: Math.round((b.top - r.top) / scale),
          right: Math.round((b.right - r.left) / scale), bottom: Math.round((b.bottom - r.top) / scale),
          fontSize: isFinite(size) && size > 1 ? Math.round(size / scale) : null,
        });
      }
      const text = boxes.filter((b) => b.label.length > 0);
      for (const b of text) {
        if (b.left < -8 || b.top < -8 || b.right > W + 8 || b.bottom > H + 8) {
          findings.push("t=" + t.toFixed(1) + "s: \\"" + b.label + "\\" sits outside the " + W + "x" + H + " canvas (x " + b.left + ".." + b.right + ", y " + b.top + ".." + b.bottom + "). It will be cropped.");
        }
      }
      for (const b of text) {
        if (b.left < 96 || b.top < 96 || b.right > W - 96 || b.bottom > H - 96) {
          findings.push("t=" + t.toFixed(1) + "s: \\"" + b.label + "\\" is inside the 96px safe margin — encoders crop it.");
          break;
        }
      }
      for (let i = 0; i < text.length; i++) {
        for (let j = i + 1; j < text.length; j++) {
          const a = text[i], b = text[j];
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 0 && h > 0 && Math.min(w, h) > 6) {
            findings.push("t=" + t.toFixed(1) + "s: \\"" + a.label + "\\" and \\"" + b.label + "\\" overlap by " + Math.round(Math.min(w, h)) + "px. Stack them in one flex column, or offset one deliberately.");
          }
        }
      }
      for (const b of text) {
        if (!b.fontSize) continue;
        if (b.fontSize < 18) findings.push("t=" + t.toFixed(1) + "s: \\"" + b.label + "\\" is " + b.fontSize + "px — unreadable as video (floor is 18).");
        else if (b.fontSize > 320) findings.push("t=" + t.toFixed(1) + "s: \\"" + b.label + "\\" is " + b.fontSize + "px over the 320 ceiling — reduce the px.");
      }
      const fonts = [];
      try {
        for (const f of citedFonts.slice(0, 12)) {
          let ok = false;
          try { ok = document.fonts.check('700 32px "' + f + '"') || document.fonts.check('400 32px "' + f + '"'); } catch (e) { ok = false; }
          fonts.push({ family: f, ok: ok });
        }
      } catch (e) {}
      post({ ev: "report", phase: "layout", ok: true, frame: Math.round(t * FPS), findings: findings.slice(0, 12), fonts: fonts, message: "rendered at t=" + t.toFixed(2) + "s — " + W + "x" + H + "@" + FPS });
    } catch (e) {}
  }

  /* Export snapshot: serialize the stage into an SVG foreignObject string. */
  function snapshot() {
    const prev = stage.style.transform;
    stage.style.transform = "scale(1)";
    let css = "";
    for (const sh of document.styleSheets) {
      try {
        for (const rule of sh.cssRules) css += rule.cssText + "\\n";
      } catch (e) { /* cross-origin sheet — skip */ }
    }
    const html = stage.outerHTML;
    stage.style.transform = prev;
    const svg = "<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"" + W + "\\" height=\\"" + H + "\\">" +
      "<foreignObject width=\\"100%\\" height=\\"100%\\">" +
      "<div xmlns=\\"http://www.w3.org/1999/xhtml\\" style=\\"width:" + W + "px;height:" + H + "px;\\">" +
      "<style>" + css.replace(/<\\//g, "<\\\\/") + "</style>" + html +
      "</div></foreignObject></svg>";
    return svg;
  }

  function raf2() { return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); }

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.ns !== "wm") return;
    if (m.cmd === "hello") {
      citedFonts = Array.isArray(m.families) ? m.families : [];
      fit();
      post({ ev: "hello-ack", t: t });
    } else if (m.cmd === "play") setPlaying(true);
    else if (m.cmd === "pause") setPlaying(false);
    else if (m.cmd === "seek") { setPlaying(false); draw(m.t || 0); }
    else if (m.cmd === "speed") speed = m.speed || 1;
    else if (m.cmd === "loop") loop = !!m.loop;
    else if (m.cmd === "export-frame") {
      (async () => {
        setPlaying(false);
        const ok = draw(m.t || 0);
        await raf2();
        if (!ok) { post({ ev: "export-frame", id: m.id, error: "render failed" }); return; }
        try { post({ ev: "export-frame", id: m.id, svg: snapshot() }); }
        catch (err) { post({ ev: "export-frame", id: m.id, error: String(err && err.message || err) }); }
      })();
    }
  });

  function errText(err) {
    var msg = err && err.message ? err.message : String(err);
    var stack = "";
    try { stack = err && err.stack ? String(err.stack).split("\\n").slice(0, 3).join(" | ").slice(0, 300) : ""; } catch (e) {}
    return stack && stack.indexOf(msg) === -1 ? msg + " [" + stack + "]" : msg;
  }

  window.addEventListener("error", (e) => {
    post({ ev: "report", phase: "runtime", ok: false, message: "runtime: " + (e && e.message ? e.message : "unknown error") });
  });

  /* Boot: evaluate bundle JS, run init, first frame, mount report. */
  function boot() {
    if (booted) return;
    booted = true;
    try {
      const factory = new Function("WM", __USERJS_WRAPPED__);
      const api = factory(WM);
      userRender = api.render;
      userInit = api.init;
    } catch (err) {
      post({ ev: "report", phase: "compile", ok: false, message: errText(err) });
      return;
    }
    if (typeof userRender !== "function") {
      post({ ev: "report", phase: "compile", ok: false, message: "Bundle JS must define function render(t, ctx)." });
      return;
    }
    const start = function () {
      try { if (typeof userInit === "function") userInit(ctxFor(0)); } catch (err) {
        post({ ev: "report", phase: "runtime", ok: false, message: "runtime: init threw: " + (err && err.message ? err.message : err) });
        return;
      }
      fit();
      post({ ev: "report", phase: "compile", ok: true, message: "bundle evaluated, render(t, ctx) bound" });
      if (draw(0)) post({ ev: "report", phase: "mount", ok: true, frame: 0, message: "mounted and rendering — " + W + "x" + H + "@" + FPS });
    };
    if (document.fonts && document.fonts.ready) {
      let done = false;
      const go = () => { if (!done) { done = true; start(); } };
      document.fonts.ready.then(go).catch(go);
      setTimeout(go, 4000);
    } else start();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
`

function escJs(s: string): string {
  // `</script` would close the embedding block early. `<!--` is subtler but
  // just as fatal: inside <script> it flips the HTML parser into its escaped
  // state, and any later `<script` string in generated code then stops the
  // real `</script>` from closing the block — the document tail parses as JS
  // and dies with "missing ) after argument list". Both are neutralized here;
  // `<\!--` parses identically inside JS strings, comments, and regexes.
  return s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--")
}

function escCss(s: string): string {
  return s.replace(/<\/style/gi, "<\\/style")
}

function stripHtmlScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script\s*>/gi, "")
}

/**
 * Builds the full srcdoc document for a bundle. Static per version — the
 * parent caches it by reloadKey and never rebuilds mid-playback.
 */
export function buildSrcdoc(bundle: WebBundle): string {
  const { width: W, height: H, fps, duration } = bundle.meta
  const families = citedFamilies(bundle)
  const links = fontLinks(families)
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n")
  const assets = bundle.meta.assets ?? {}
  const assetStyles = (assets.styles ?? [])
    .slice(0, 6)
    .filter((u) => u.startsWith("https://"))
    .map((u) => `<link rel="stylesheet" href="${u}">`)
    .join("\n")
  const assetScripts = (assets.scripts ?? [])
    .slice(0, 6)
    .filter((u) => u.startsWith("https://"))
    .map((u) => `<script src="${u}"><\/script>`)
    .join("\n")
  const userJsWrapped = `${escJs(bundle.js)}\nreturn { render: (typeof render !== "undefined" ? render : undefined), init: (typeof init !== "undefined" ? init : undefined) };`
  const driver = DRIVER_JS.split("__W__").join(String(W))
    .split("__H__").join(String(H))
    .split("__FPS__").join(String(fps))
    .split("__DUR__").join(String(duration))
    .split("__USERJS_WRAPPED__").join(userJsWrapped)
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; font-src https: data:; img-src https: data: blob:; media-src https: data: blob:; connect-src https:;">
<meta name="viewport" content="width=${W}, height=${H}">
${links}
${assetStyles}
${assetScripts}
<style>
html,body{margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden}
#wm-viewport{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000}
#wm-stage{position:relative;width:${W}px;height:${H}px;flex:none;transform-origin:center center;overflow:hidden;background:#000}
${escCss(bundle.css)}
</style></head>
<body><div id="wm-viewport"><div id="wm-stage">${stripHtmlScripts(bundle.html)}</div></div>
<script>${RUNTIME_JS}</script>
<script>${driver}</script>
</body></html>`
}

/** Families for the parent's hello handshake (font truth for the audit). */
export function helloFamilies(bundle: WebBundle): string[] {
  return citedFamilies(bundle)
}
