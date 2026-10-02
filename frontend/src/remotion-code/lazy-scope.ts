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
  apply: (mod: Record<string, unknown>, source: string) => Record<string, unknown>
}

/**
 * Reads the names a composition explicitly requested from `@remotion/media`.
 *
 * Imports are stripped before compilation, so the scope builder must retain
 * their provenance: `Video` from `@remotion/media` and `Video` from
 * `remotion` are different components and only the source text knows which
 * one the model meant.
 */
function mediaImportAliases(source: string): Record<string, string> {
  const aliases: Record<string, string> = {}
  const importPattern =
    /import\s+(?!type\b)([\s\S]*?)\s+from\s*["']@remotion\/media["']/g
  let match: RegExpExecArray | null
  while ((match = importPattern.exec(source)) !== null) {
    const clause = match[1]!.trim()
    const namespace = /^\*\s*as\s+([A-Za-z_$][\w$]*)$/.exec(clause)
    if (namespace) {
      aliases[namespace[1]!] = "*"
      continue
    }
    const named = /\{([\s\S]*)\}/.exec(clause)?.[1]
    if (!named) continue
    for (const entry of named.split(",")) {
      const name = entry.trim()
      if (!name || name.startsWith("type ")) continue
      const parts = name.split(/\s+as\s+/)
      const exported = parts[0]!.trim()
      const local = (parts[1] ?? exported).trim()
      if (/^[A-Za-z_$][\w$]*$/.test(exported) && /^[A-Za-z_$][\w$]*$/.test(local)) {
        aliases[local] = exported
      }
    }
  }
  return aliases
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
    apply: (m, source) => {
      const scope: Record<string, unknown> = {
        MediaVideo: m.Video as unknown,
        MediaAudio: m.Audio as unknown,
        parseMedia: m.parseMedia,
      }
      // Honor the package the model actually named. Without this, `Video`
      // imported from `@remotion/media` would silently resolve to Remotion
      // core's `Video`, dropping media-only props such as `trimBefore`.
      for (const [local, exported] of Object.entries(mediaImportAliases(source))) {
        if (exported === "*") {
          scope[local] = m
        } else if (exported in m) {
          scope[local] = m[exported]
        }
      }
      return scope
    },
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
    Object.assign(out, needed[i]!.apply(r.value, source))
  })
  return out
}

/** Kept so the module is not tree-shaken when no cut uses media. */
export const __mediaLoader = mediaPkg
