---
name: web-3d
description: Three.js in bundles — pinned CDN, init() scene, t-driven camera.
---
# Web 3D

meta.assets.scripts gets https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.min.js. init() builds renderer/scene/camera/lights/mesh on <canvas id="scene3d">. render(t, ctx) sets camera + rotation from t and calls renderer.render. NEVER requestAnimationFrame in the bundle. Geometry light (segments ≤ 32). .glb needs https + CORS. Torus-knot fallback renders with no hosting.

