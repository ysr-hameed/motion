import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { continueRender, delayRender } from "remotion"
import { compile } from "./compile"
import { ensureFontsLoaded } from "./fonts"

/**
 * The component the Player mounts for a code artifact.
 *
 * Compilation is async because the scope is assembled for this specific
 * source — the optional packages and the Google Fonts it cites are
 * fetched only when the text refers to them. Remotion's `delayRender`
 * holds the render open until that resolves, so the first captured frame
 * is never an empty canvas.
 *
 * Throwing during render is deliberate: a broken file propagates to
 * Remotion's own error boundary, which the player already reports. That
 * gives one failure path instead of two — a silent compile-error slate
 * and a separate render-error handler that can disagree.
 */
export const CodeComposition: React.FC<Record<string, unknown>> = ({
  code,
  inputProps,
}) => {
  const source = code as string
  const compiled = useMemo(
    () =>
      compile(source).then(async (result) => {
        // The scope is ready, but the faces it references are not — the
        // stylesheet still has to arrive before frame 0 is captured.
        await ensureFontsLoaded(source)
        return result
      }),
    [source]
  )

  // The handle has to exist during render, because Remotion checks for
  // open handles before it captures a frame. `useState` guarantees exactly
  // one per mount; the ref stops the two release paths racing.
  const [handle] = useState(() => delayRender("Compiling composition"))
  const released = useRef(false)
  const release = useCallback(() => {
    if (released.current) return
    released.current = true
    continueRender(handle)
  }, [handle])

  // Resolve on both paths: a failure has to reach the error boundary, and
  // the render must be released before it can.
  compiled.then(release, release)

  // Unmounting mid-compile must still release, or the render hangs.
  useEffect(() => release, [release])

  return (
    <Suspense fallback={null}>
      <Mount promise={compiled} inputProps={(inputProps as object) ?? {}} />
    </Suspense>
  )
}

function Mount({
  promise,
  inputProps,
}: {
  promise: Promise<{ component: React.ComponentType<Record<string, unknown>> }>
  inputProps: object
}) {
  const { component: Component } = React.use(promise)
  return <Component {...(inputProps as Record<string, unknown>)} />
}

/** Compiles without mounting, for the export path and tests. */
export async function compileForRender(code: string) {
  const { component } = await compile(code)
  await ensureFontsLoaded(code)
  return component
}
