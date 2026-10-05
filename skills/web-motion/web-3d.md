---
name: web-3d
description: Three.js in bundles — pinned CDN, init() scene, t-driven camera, torus-knot fallback. Load for 3D briefs.
---

# Web 3D

## Setup (three steps, no bundler)

1. html: `<canvas id="scene3d" width="1920" height="1080"></canvas>` positioned as a layer.
2. `meta.assets.scripts`: `["https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.min.js"]` — pinned version, jsdelivr only.
3. `init()` builds renderer/scene/camera/lights/mesh. `render(t, ctx)` sets camera + rotation from `t` and calls `renderer.render`.

```js
function init(ctx) {
  var R = new THREE.WebGLRenderer({ canvas: ctx.el("scene3d"), alpha: true });
  // scene, camera(fov 45), ambient + directional, mesh (segments ≤ 32). Store on ctx (ctx._r = R ...).
}
function render(t, ctx) {
  var f = ctx.frame;
  var a = ctx.interpolate(f, [0, 150], [0, Math.PI * 2]);
  ctx._cam.position.set(Math.sin(a) * 6, 2, Math.cos(a) * 6); // orbit
  ctx._cam.lookAt(0, 0, 0);
  ctx._mesh.rotation.y = t * 1.2;
  ctx._r.render(ctx._scene, ctx._cam);
}
```

## Rules that prevent flicker and failure

- NEVER `requestAnimationFrame` in the bundle — the driver owns the clock. A second loop desyncs scrub/export.
- Camera moves are `t`-computed values (orbit/dolly/pan/static rigs — see `three_scene_create` output).
- Geometry light: box/sphere/torus, segments ≤ 32. Heavy scenes kill iframe fps AND export (snapshots wait per frame).
- `.glb` models need an https host WITH CORS, Draco-compressed, <5MB. Without hosting: ship the torus-knot fallback — real 3D today, model swap later.
- Alpha renderer over a CSS gradient stage (cheaper than scene fog, matches palette exactly).

## 2.5D before 3D

Ask first: does the brief need REAL 3D? Parallax layers + counter-rotation + gradients fake depth convincingly for emblems and heroes at 1/10th the cost and 10× the export fidelity. Reserve Three.js for rotation-through-space, topology, and lighting the brief explicitly demands.
