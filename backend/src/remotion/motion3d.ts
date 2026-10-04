/**
 * Real 3D in web bundles via pinned Three.js CDN.
 *
 * The rule, always: a <canvas> in the html part, Three.js loaded from a
 * pinned jsdelivr/unpkg URL in meta.assets.scripts, and the camera driven
 * by t inside render() — never requestAnimationFrame loops of its own
 * (the driver already owns the clock; a second loop desyncs scrub/export).
 */

const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.min.js"

export function threeSceneCreate(
  kind: "orbit" | "dolly" | "pan" | "static" = "orbit",
  seconds = 5
): { snippet: string; note: string } {
  const frames = Math.min(900, Math.round(seconds * 30))
  const rig =
    kind === "orbit"
      ? `const a = ctx.interpolate(f, [0, ${frames}], [0, Math.PI * 2]);\ncamera.position.set(Math.sin(a) * 6, 2, Math.cos(a) * 6); // orbit: radius 6, height 2`
      : kind === "dolly"
        ? `const dolly = ctx.interpolate(f, [0, ${frames}], [7, 3], { easing: ctx.Easing.easeOut });\ncamera.position.set(0, 1.5, dolly); // dolly: push 7→3`
        : kind === "pan"
          ? `const pan = ctx.interpolate(f, [0, ${frames}], [-4, 4], { easing: ctx.Easing.easeOut });\ncamera.position.set(pan, 1.5, 6); // pan: sweep -4→4`
          : `camera.position.set(0, 1.5, 6); // static: subject moves, camera holds`
  return {
    snippet: [
      `<!-- html part: --><canvas id="scene3d" width="1920" height="1080"></canvas>`,
      `// meta.assets.scripts: ["${THREE_CDN}"]`,
      `// init(ctx): renderer = new THREE.WebGLRenderer({ canvas: ctx.el("scene3d"), alpha: true });`,
      `//   scene, camera(fov 45), ambient + directional lights, mesh (box/sphere/torus, segments ≤ 32).`,
      `// render(t, ctx): const f = ctx.frame; const spin = t * 1.2; // subject rotation, t-driven`,
      `${rig}`,
      `// camera.lookAt(0, 0, 0); mesh.rotation.y = spin; renderer.render(scene, camera);`,
      `// NEVER requestAnimationFrame inside the bundle — the driver calls render(t, ctx) every frame.`,
    ].join("\n"),
    note: `${kind} over ${frames}f, Three.js pinned CDN in meta.assets. Camera is a t-computed value. Keep geometry light for iframe + export perf. Models (.glb) need an https host with CORS first.`,
  }
}

export function threeCameraPath(
  type: "dolly" | "pan" | "orbit" | "fly-through",
  keyframes: Array<[number, number, number]> = []
): { path: Array<[number, number, number]>; easing: string; note: string } {
  const path: Array<[number, number, number]> =
    keyframes.length >= 2
      ? keyframes
      : [
          [0, 1.5, 6],
          [0, 1.5, 2],
        ]
  return {
    path,
    easing: "ctx.Easing.bezier(0.16,1,0.3,1) per segment — ease the CAMERA, not just the subject; hold 15f at each keyframe so the move reads as intentional.",
    note: `${type} through ${path.length} keyframe(s). Lerp between points with ctx.interpolate(f, [segStart, segEnd], [0, 1]) per segment. Sync segment boundaries to beat boundaries.`,
  }
}

export function threeModelAnimate(
  model: string,
  animation: "rotate" | "float" | "entrance" = "entrance",
  seconds = 5
): { snippet: string; note: string } {
  const frames = Math.min(900, Math.round(seconds * 30))
  const endSec = (frames / 30).toFixed(2)
  return {
    snippet: [
      `// model: ${model} (.glb/.gltf, Draco-compressed, <5MB, https host with CORS first)`,
      `// load once in init() with THREE.GLTFLoader (add its CDN script to meta.assets.scripts).`,
      `const rotation = ctx.interpolate(f, [0, ${frames}], [0, Math.PI * 2]);`,
      `const floatY = Math.sin(t * 4.2) * 0.15; // deterministic hover, t-driven`,
      animation === "entrance"
        ? `const enter = ctx.spring(t, { damping: 14, mass: 1, stiffness: 120 }); // overshoot landing`
        : `const enter = 1;`,
      `// group.rotation.y = rotation; group.position.y = ${animation === "float" ? "floatY" : "0"}; group.scale.setScalar(Math.max(0.001, enter));`,
      `// No-model fallback (renders TODAY, no hosting): a torus knot hero —`,
      `// const geo = new THREE.TorusKnotGeometry(1.4, 0.4, 128, 24);`,
      `// const mat = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.25, metalness: 0.6 });`,
      `// End state holds to ${endSec}s so the cut resolves.`,
    ].join("\n"),
    note: `${animation} over ${frames}f, t-driven (never requestAnimationFrame). Without a hosted model, ship the torus-knot fallback — real 3D today, model swap later.`,
  }
}
