/**
 * Real 3D via @remotion/three (installed + in the player scope).
 *
 * The Remotion rule, always: declarative ThreeCanvas driven by
 * useCurrentFrame — useFrame() is FORBIDDEN (it flickers across renders).
 * Camera moves are numbers computed from frame, passed as props.
 */

export function threeSceneCreate(
  kind: "orbit" | "dolly" | "pan" | "static" = "orbit",
  seconds = 5
): { snippet: string; note: string } {
  const frames = Math.min(900, Math.round(seconds * 30))
  const rig =
    kind === "orbit"
      ? `const t = interpolate(frame, [0, ${frames}], [0, Math.PI * 2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const camPos: [number, number, number] = [Math.sin(t) * 6, 2, Math.cos(t) * 6]; // orbit: radius 6, height 2`
      : kind === "dolly"
        ? `const dolly = interpolate(frame, [0, ${frames}], [7, 3], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const camPos: [number, number, number] = [0, 1.5, dolly]; // dolly: push 7→3`
        : kind === "pan"
          ? `const pan = interpolate(frame, [0, ${frames}], [-4, 4], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const camPos: [number, number, number] = [pan, 1.5, 6]; // pan: sweep -4→4`
          : `const camPos: [number, number, number] = [0, 1.5, 6]; // static: subject moves, camera holds`;
  return {
    snippet: [
      `import { ThreeCanvas } from "@remotion/three";`,
      `const frame = useCurrentFrame();`,
      `const { width, height } = useVideoConfig();`,
      `const spin = frame * 0.02; // subject rotation, frame-driven`,
      `${rig}`,
      `<ThreeCanvas width={width} height={height} camera={{ position: camPos, fov: 45 }}>`,
      `  <ambientLight intensity={0.5} />`,
      `  <directionalLight position={[5, 5, 5]} intensity={1} />`,
      `  <mesh rotation={[0, spin, 0]}>`,
      `    <boxGeometry args={[2, 2, 2]} />`,
      `    <meshStandardMaterial color={ACCENT} roughness={0.3} />`,
      `  </mesh>`,
      `</ThreeCanvas> // declarative only — NEVER useFrame (flickers across renders)`,
    ].join("\n"),
    note: `${kind} over ${frames}f, @remotion/three installed and in scope. Camera is a frame-computed prop. Keep geometry light (box/sphere/torus, segments ≤32) for Player perf. Models (.glb) still need R2/staticFile hosting first.`,
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
      `// model: ${model} (.glb/.gltf, Draco-compressed, <5MB, hosted in R2/staticFile first)`,
      `const rotation = interpolate(frame, [0, ${frames}], [0, Math.PI * 2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });`,
      `const floatY = Math.sin(frame / 15) * 0.15; // deterministic hover`,
      animation === "entrance"
        ? `const enter = spring({ frame, fps: 30, config: { damping: 14, mass: 1, stiffness: 120 } }); // overshoot landing`
        : `const enter = 1;`,
      `// <primitive object={gltf.scene} rotation-y={rotation} position-y={animation === "float" ? floatY : 0} scale={enter} />`,
      `// No-model fallback (renders TODAY, no hosting): a torus knot hero —`,
      `// <mesh rotation={[frame * 0.01, rotation, 0]} scale={enter}>`,
      `//   <torusKnotGeometry args={[1.4, 0.4, 128, 24]} />`,
      `//   <meshStandardMaterial color={ACCENT} roughness={0.25} metalness={0.6} />`,
      `// </mesh>`,
    ].join("\n"),
    note: `${animation} over ${frames}f, useCurrentFrame-driven (never useFrame). Without a hosted model, ship the torus-knot fallback — real 3D today, model swap later.`,
  }
}
