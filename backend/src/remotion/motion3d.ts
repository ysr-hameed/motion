/**
 * Phase 4 3D foundation (IMPLEMENTATION_PLAN.md §7.1).
 * Basic camera-animation specs and React Three Fiber scaffolds that compose
 * with the Remotion timeline (useCurrentFrame-driven). Full model loading and
 * shader customization are later scope — each helper names its boundary.
 */

export function threeSceneCreate(
  kind: "orbit" | "dolly" | "pan" | "static" = "orbit",
  seconds = 5
): { snippet: string; note: string } {
  const frames = Math.min(900, Math.round(seconds * 30))
  return {
    snippet: [
      `// npm: three @react-three/fiber (add to frontend package.json; not yet installed)`,
      `import { Canvas, useFrame } from "@react-three/fiber";`,
      `function Rig() {`,
      `  const frame = useCurrentFrame(); // Remotion clock drives the 3D clock`,
      `  const t = interpolate(frame, [0, ${frames}], [0, Math.PI * 2]);`,
      `  useFrame(({ camera }) => {`,
      `    // ${kind}: radius 6, height 2 — replace with dolly/pan per kind`,
      `    camera.position.set(Math.sin(t) * 6, 2, Math.cos(t) * 6);`,
      `    camera.lookAt(0, 0, 0);`,
      `  });`,
      `  return <mesh><boxGeometry /><meshStandardMaterial /></mesh>;`,
      `}`,
      `<Canvas> <ambientLight /> <Rig /> </Canvas> // mount INSIDE the composition component`,
    ].join("\n"),
    note: `Foundation only: ${kind} rig over ${frames}f. three/@react-three/fiber are NOT in package.json yet — install before use. Lighting: ambient + one directional; keep poly counts low for Player perf.`,
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
    easing: "Easing.bezier(0.16,1,0.3,1) per segment — ease the CAMERA, not just the subject; hold 15f at each keyframe so the move reads as intentional.",
    note: `${type} through ${path.length} keyframe(s). Bezier through points in code (no runtime curve lib wired). Sync segment boundaries to beat boundaries.`,
  }
}

export function threeModelAnimate(
  model: string,
  animation: "rotate" | "float" | "entrance" = "entrance",
  seconds = 5
): { snippet: string; note: string } {
  const frames = Math.min(900, Math.round(seconds * 30))
  return {
    snippet: [
      `// model: ${model} (.glb/.gltf, Draco-compressed, <5MB)`,
      `const rotation = animation === "rotate"`,
      `  ? interpolate(frame, [0, ${frames}], [0, Math.PI * 2])`,
      `  : 0; // float: Math.sin(frame / 15) * 0.15 on position.y`,
      animation === "entrance"
        ? `const scale = spring({ frame, fps: 30, config: { damping: 200 } }); // overshoot landing`
        : `const scale = 1;`,
      `// <primitive object={gltf.scene} rotation-y={rotation} scale={scale} />`,
    ].join("\n"),
    note: `Model loading (useGLTF + suspense + R2 hosting) is NOT wired — host ${model} in R2/staticFile first. ${animation} over ${frames}f, driven by useCurrentFrame for determinism.`,
  }
}
