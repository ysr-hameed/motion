/**
 * Demo bundle — re-exported from the web runtime so the skills builder
 * (`backend/scripts/build-skills.mjs` reads DEMO_CODE out of this file)
 * and the Studio keep working unchanged.
 *
 * This is a hand-written web bundle in exactly the shape the agent writes
 * (html + css + js with render(t, ctx)) and it goes through the identical
 * iframe pipeline. If this stops rendering, the runtime is broken.
 */
export { DEMO_BUNDLE_JSON as DEMO_CODE, DEMO_PLAN } from "~/web/demo"
