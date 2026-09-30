import { Hono } from "hono"
import { skillIds, SKILLS_REMOTION_VERSION } from "../lib/remotion-skills"
import { SKILLS } from "../lib/remotion-skills.generated"
import { CONTRACTS } from "../lib/remotion-guide"
import type { Env } from "../env"

const app = new Hono<Env>()

/**
 * What the renderer can actually do — no auth, deterministic, cacheable.
 *
 * This replaces the old /capabilities endpoint, which listed 18 layer
 * types and 80 allowed properties. That list existed because the model
 * had to fit a shape. Now the model writes TypeScript, so the honest
 * answer to "what can a composition do" is "whatever Remotion does", and
 * this endpoint names the documentation the composer is actually given.
 */
app.get("/api", (c) =>
  c.json({
    packages: [
      "remotion",
      "@remotion/transitions",
      "@remotion/shapes",
      "@remotion/paths",
      "@remotion/motion-blur",
      "@remotion/noise",
      "react",
      "react-dom",
      "lucide-react",
    ],
    formats: ["16:9", "9:16", "1:1"],
    fps: { min: 24, max: 60 },
    durationFrames: { min: 15, max: 1800 },
    /**
     * The vendored Agent Skills the composer prompt is built from, and
     * the Remotion version they were fetched for. Kept in step with the
     * installed runtime by `scripts/sync-remotion-skills.mjs`.
     */
    skills: {
      source: "https://github.com/remotion-dev/skills",
      remotionVersion: SKILLS_REMOTION_VERSION,
      available: skillIds(),
    },
    contracts: CONTRACTS,
  })
)

/** One skill's markdown, for debugging what the model was told. */
app.get("/skills/:id", (c) => {
  const id = c.req.param("id")
  const content = SKILLS[id]
  if (!content) return c.json({ error: `Unknown skill "${id}"` }, 404)
  return c.json({ id, content })
})

export default app
