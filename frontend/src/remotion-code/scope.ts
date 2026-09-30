import * as React from "react"
import * as Remotion from "remotion"
import {
  TransitionSeries,
  linearTiming,
  springTiming,
  useTransitionProgress,
} from "@remotion/transitions"
import { fade } from "@remotion/transitions/fade"
import { slide } from "@remotion/transitions/slide"
import { wipe } from "@remotion/transitions/wipe"
import { flip } from "@remotion/transitions/flip"
import { clockWipe } from "@remotion/transitions/clock-wipe"
import { bookFlip } from "@remotion/transitions/book-flip"
import { dissolve } from "@remotion/transitions/dissolve"
import { iris } from "@remotion/transitions/iris"
import { ripple } from "@remotion/transitions/ripple"
import { none } from "@remotion/transitions/none"
import { zoomInOut } from "@remotion/transitions/zoom-in-out"
import { crossZoom } from "@remotion/transitions/cross-zoom"
import * as Shapes from "@remotion/shapes"
import * as Paths from "@remotion/paths"
import { Trail } from "@remotion/motion-blur"
import * as Noise from "@remotion/noise"
import * as Lucide from "lucide-react"

/**
 * The scope an AI-written composition runs in.
 *
 * Two things happen here that the model cannot be trusted to do itself:
 *
 *  1. Its `import` statements are stripped at load, and every name it
 *     imported is resolved from this object instead. So the model writes
 *     ordinary, idiomatic Remotion code — `import {AbsoluteFill} from
 *     "remotion"` — and it always resolves, with no bundler and no
 *     network fetch of a module that might not exist.
 *
 *  2. The scope is a plain object literal, not a module. Anything the
 *     model uses that is not listed below is a ReferenceError it can see
 *     and fix, rather than a silent `undefined` that breaks 200 frames
 *     in.
 *
 * This is the whole ceiling on what a cut can do. It is deliberately the
 * entire Remotion surface plus React, not a hand-picked subset.
 */

/** Presentation shorthands, so `<TransitionSeries.Transition>` reads well. */
const Transition = TransitionSeries.Transition
const Overlay = TransitionSeries.Overlay

export const SCOPE: Record<string, unknown> = {
  // React
  React,
  useState: React.useState,
  useEffect: React.useEffect,
  useLayoutEffect: React.useLayoutEffect,
  useMemo: React.useMemo,
  useCallback: React.useCallback,
  useRef: React.useRef,
  useContext: React.useContext,
  useReducer: React.useReducer,
  useId: React.useId,
  memo: React.memo,
  forwardRef: React.forwardRef,
  Fragment: React.Fragment,
  createElement: React.createElement,

  // Remotion core
  AbsoluteFill: Remotion.AbsoluteFill,
  Sequence: Remotion.Sequence,
  Series: Remotion.Series,
  Loop: Remotion.Loop,
  Still: Remotion.Still,
  Freeze: Remotion.Freeze,
  IFrame: Remotion.IFrame,
  Img: Remotion.Img,
  Video: Remotion.Video,
  OffthreadVideo: Remotion.OffthreadVideo,
  Audio: Remotion.Audio,
  AnimatedImage: Remotion.AnimatedImage,
  Solid: Remotion.Solid,
  Composition: Remotion.Composition,
  /**
   * `Interactive.*` is how Remotion wants anything authored today — each
   * element becomes a separately editable node in the Studio. Remotion's
   * own skills tell the model to use it, so leaving it out of scope would
   * have made the documented best practice fail at render time with
   * "Interactive is not defined".
   */
  Interactive: Remotion.Interactive,
  interpolate: Remotion.interpolate,
  interpolateColors: Remotion.interpolateColors,
  Easing: Remotion.Easing,
  spring: Remotion.spring,
  measureSpring: Remotion.measureSpring,
  random: Remotion.random,
  useCurrentFrame: Remotion.useCurrentFrame,
  useVideoConfig: Remotion.useVideoConfig,
  useCurrentScale: Remotion.useCurrentScale,
  usePixelDensity: Remotion.usePixelDensity,
  useBufferState: Remotion.useBufferState,
  useDelayRender: Remotion.useDelayRender,
  staticFile: Remotion.staticFile,
  getInputProps: Remotion.getInputProps,
  delayRender: Remotion.delayRender,
  continueRender: Remotion.continueRender,
  cancelRender: Remotion.cancelRender,
  createEffect: Remotion.createEffect,
  assertValidInterpolateEasingOption:
    Remotion.assertValidInterpolateEasingOption,
  assertValidInterpolatePosterizeOption:
    Remotion.assertValidInterpolatePosterizeOption,

  // Transitions
  TransitionSeries,
  Transition,
  Overlay,
  linearTiming,
  springTiming,
  useTransitionProgress,
  fade,
  slide,
  wipe,
  flip,
  clockWipe,
  bookFlip,
  dissolve,
  iris,
  ripple,
  none,
  zoomInOut,
  crossZoom,

  // Shapes — every one is a named export too, so `Shapes.Circle` works
  // as well as `Circle`.
  ...Shapes,
  Shapes,

  // Paths
  ...Paths,
  Paths,

  // Motion blur
  Trail,

  // Noise
  ...Noise,

  // Icons
  Lucide,
  // `Shapes` and `Paths` are already spread above, but a composition that
  // wrote `Shapes.Circle` needs the namespace too — it is in the object.
}

/**
 * Globals a composition may reach for.
 *
 * Read off `globalThis` rather than named directly, and only when they
 * exist. Remotion's web renderer runs the composition inside a Web
 * Worker, where `window`, `document` and `navigator` are all undefined —
 * naming them here would throw at import time and take the whole renderer
 * with it, so each is added only if the environment actually has it.
 */
const g = globalThis as Record<string, unknown>

/** Globals that exist in every JS environment. */
const ALWAYS: string[] = [
  "console",
  "fetch",
  "Math",
  "Date",
  "JSON",
  "Promise",
  "Intl",
  "URL",
  "Blob",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "TextEncoder",
  "TextDecoder",
  "URLSearchParams",
  "structuredClone",
]

/** Globals that only exist in a DOM, and only outside a worker. */
const DOM_ONLY: string[] = [
  "window",
  "document",
  "navigator",
  "Image",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "performance",
  "localStorage",
  "matchMedia",
]

for (const name of [...ALWAYS, ...DOM_ONLY]) {
  if (name in g) SCOPE[name] = g[name]
}

/** Every name a composition may use, for the UI's "what can it do" view. */
export function scopeNames(): string[] {
  return Object.keys(SCOPE).sort()
}

/**
 * Names that must resolve. A composition referencing anything outside
 * this list will throw at render, so the compile step can say so up
 * front with a message the repairer can act on.
 */
export function isKnownName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCOPE, name)
}
