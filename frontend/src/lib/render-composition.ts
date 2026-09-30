import { renderMediaOnWeb } from "@remotion/web-renderer"
import { ClipRenderer } from "@/remotion/ClipRenderer"
import { CodeComposition } from "@/remotion-code/CodeComposition"
import type { Artifact } from "@/lib/artifact"
import type { ExportSettings } from "@/lib/use-motion-studio"

export class RenderCancelled extends Error {
  constructor() {
    super("cancelled")
    this.name = "RenderCancelled"
  }
}

export interface CompositionRenderJob {
  artifact: Artifact
  compositionId: string
  width: number
  height: number
  fps: number
  totalFrames: number
  /** Resolution multiplier from the quality setting. */
  scale: number
  container: ExportSettings["container"]
  signal: AbortSignal
  onProgress: (done: number, total: number) => void
}

export interface CompositionRenderResult {
  blob: Blob
  ext: string
  note?: string
}

/**
 * Real video export in the browser via Remotion's official web renderer.
 *
 * The same component the preview mounts is what gets encoded, so what
 * plays and what ships cannot drift. A code artifact compiles through
 * `CodeComposition`; a legacy JSON document still goes through the old
 * `ClipRenderer`, which is retained read-only for versions made before
 * the code editor existed.
 */
export async function renderComposition(
  job: CompositionRenderJob,
): Promise<CompositionRenderResult> {
  const wantsMp4 = job.container === "MP4"

  const isCode = job.artifact.kind === "code"
  const component = isCode
    ? CodeComposition
    : (ClipRenderer as React.ComponentType<Record<string, unknown>>)
  const inputProps = isCode
    ? { code: (job.artifact as { code: string }).code }
    : { doc: (job.artifact as { doc: unknown }).doc }

  let result;
  try {
    result = await renderMediaOnWeb({
      composition: {
        component,
        durationInFrames: job.totalFrames,
        fps: job.fps,
        width: job.width,
        height: job.height,
        id: job.compositionId,
        defaultProps: inputProps,
      },
      inputProps,
      container: wantsMp4 ? "mp4" : "webm",
      videoCodec: wantsMp4 ? "h264" : "vp9",
      videoBitrate: "high",
      scale: job.scale,
      signal: job.signal,
      pageResponsiveness: "medium",
      logLevel: "error",
      onProgress: ({ progress }) => {
        job.onProgress(
          Math.min(job.totalFrames, Math.round(progress * job.totalFrames)),
          job.totalFrames,
        );
      },
    });
  } catch (e) {
    if (job.signal.aborted) throw new RenderCancelled();
    throw new Error(
      e instanceof Error && /webcodecs|encode|support/i.test(e.message)
        ? "This browser can't encode video — try Chrome or Edge."
        : (e as Error)?.message || "Render failed — please try again.",
    );
  }

  if (job.signal.aborted) throw new RenderCancelled();
  const blob = await result.getBlob();
  return {
    blob,
    ext: wantsMp4 ? "mp4" : "webm",
  };
}
