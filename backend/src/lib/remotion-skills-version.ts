/**
 * Remotion version the vendored skills were fetched for.
 *
 * Split out from `remotion-skills.generated` on purpose. That file is 112KB
 * of markdown in one object literal; importing it for a 12-character version
 * string forced the runtime to construct the whole object on the chat
 * request path, where none of it is used. The chat route needs the version
 * for diagnostics only, so this module keeps that free.
 *
 * `scripts/sync-remotion-skills.mjs` rewrites the generated file; keep this
 * in step with it (the sync script asserts the two agree).
 */
export const SKILLS_REMOTION_VERSION = "4.0.529"