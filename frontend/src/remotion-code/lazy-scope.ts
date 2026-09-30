/**
 * Lazily-loaded parts of the composition scope.
 *
 * Everything in this file is either large or rarely used, and importing
 * it eagerly put 2.3 MB into the initial bundle for capabilities that
 * most cuts never touch:
 *
 *   @remotion/media         715 KB   — only for cutting a video
 *   @remotion/lottie        531 KB   — only for After Effects rigs
 *   @remotion/rough-notation 269 KB  — only for hand-drawn marks
 *   @remotion/gif           251 KB   — only for GIFs
 *   @remotion/media-parser  247 KB   — only alongside media
 *   23 Google Fonts         348 KB   — only the faces a cut cites
 *
 * So each is behind a dynamic `import()`, which Vite splits into its own
 * chunk, and `buildOptionalScope` fetches only the ones the source
 * actually references. A cut with no video, no Lottie and no GIF pays
 * nothing; a cut that needs one pays for one.
 *
 * The scan is deliberately dumb — a name in the text is enough. A false
 * positive costs one cached chunk; a false negative costs the model a
 * ReferenceError, and it retries with a working import anyway.
 */

/** One package, how to load it, and what in the source means it is needed. */
interface Optional {
  load: () => Promise<Record<string, unknown>>
  /** Source patterns that should trigger the load. */
  match: RegExp
  /** How to fold the module into the scope. */
  apply: (mod: Record<string, unknown>) => Record<string, unknown>
}

const mediaPkg = () =>
  import("@remotion/media").then((m) => ({ ...m, parseMedia: undefined }))

export const OPTIONAL: Optional[] = [
  {
    // Video and audio elements, plus media parsing for trimming.
    match: /from\s*["']@remotion\/media["']|\bMediaVideo\b|\bMediaAudio\b|\bparseMedia\b/,
    load: async () => {
      const [media, parser] = await Promise.all([
        import("@remotion/media"),
        import("@remotion/media-parser"),
      ])
      return { ...media, parseMedia: parser.parseMedia }
    },
    apply: (m) => ({
      MediaVideo: m.Video as unknown,
      MediaAudio: m.Audio as unknown,
      parseMedia: m.parseMedia,
    }),
  },
  {
    match: /from\s*["']@remotion\/lottie["']|\bLottie\b|getLottieMetadata/,
    load: () => import("@remotion/lottie").then((m) => ({ ...m })),
    apply: (m) => ({ Lottie: m.Lottie, getLottieMetadata: m.getLottieMetadata }),
  },
  {
    match: /from\s*["']@remotion\/gif["']|<Gif\b|\bpreloadGif\b|getGifDurationInSeconds/,
    load: () => import("@remotion/gif").then((m) => ({ ...m })),
    apply: (m) => ({
      Gif: m.Gif,
      preloadGif: m.preloadGif,
      getGifDurationInSeconds: m.getGifDurationInSeconds,
    }),
  },
  {
    // The rough-notation primitives have ordinary names (Underline,
    // Circle, Highlight), so the import line is the reliable signal and
    // the JSX tag names are the fallback.
    match: /@remotion\/rough-notation|<Underline\b|<Highlight\b|<CrossedOff\b|<StrikeThrough\b|\bRough\./,
    load: () => import("@remotion/rough-notation").then((m) => ({ ...m })),
    apply: (m) => m,
  },
  {
    match: /from\s*["']@remotion\/captions["']|createTikTokStyleCaptions|parseSrt|serializeSrt/,
    load: () => import("@remotion/captions").then((m) => ({ ...m })),
    apply: (m) => ({
      createTikTokStyleCaptions: m.createTikTokStyleCaptions,
      parseSrt: m.parseSrt,
      serializeSrt: m.serializeSrt,
    }),
  },
]

/** Packages the scan decided this source needs. */
export function optionalNames(source: string): string[] {
  return OPTIONAL.filter((o) => o.match.test(source)).map(
    (o) => o.load.toString().match(/@remotion\/([a-z-]+)/)?.[1] ?? "optional"
  )
}

/**
 * Loads and folds in the optional packages a source references.
 * A package that fails to load is skipped rather than failing the whole
 * composition — the model gets a ReferenceError for that one name and
 * repairs it, which beats a blank canvas.
 */
export async function buildOptionalScope(
  source: string
): Promise<Record<string, unknown>> {
  const needed = OPTIONAL.filter((o) => o.match.test(source))
  if (needed.length === 0) return {}
  const settled = await Promise.allSettled(needed.map((o) => o.load()))
  const out: Record<string, unknown> = {}
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled") return
    Object.assign(out, needed[i]!.apply(r.value))
  })
  return out
}

/** Kept so the module is not tree-shaken when no cut uses media. */
export const __mediaLoader = mediaPkg
