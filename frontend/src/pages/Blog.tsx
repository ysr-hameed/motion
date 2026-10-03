import { Link } from "react-router-dom";
import { PublicShell } from "~/components/layout";

const POSTS: Array<[string, string, string, string[]]> = [
  ["Why we render in your browser", "Oct 2026", "The preview IS the export path — same code, same frames, zero 'but it looked fine in the editor'.", [
    "Most motion tools preview an approximation and render something else on export. We compile the actual Remotion composition in your browser and mount it in Remotion's own player.",
    "What you scrub is what the render farm gets. Font, timing, easing — identical, because there is only one code path.",
  ]],
  ["60-second motion graphics: what's actually automated", "Oct 2026", "Intent extraction, beat planning, asset sourcing and QA run as parallel workstreams — you only answer what's truly ambiguous.", [
    "A 'product launch video' brief fans out into design, content and technical plans that merge onto one timeline. The questionnaire asks only for gaps, as quick picks, in about ten seconds.",
    "The result: ~8 model calls per turn instead of 40+, and most users export without a single edit.",
  ]],
  ["Paddle billing, Stack auth, zero boilerplate", "Oct 2026", "Motion accounts run on SlyxUp Stack: sessions, 2FA, teams, API keys and Paddle entitlements out of the box.", [
    "No passwords stored here, no homegrown sessions. Sign in once and the same identity carries your plan across every SlyxUp app.",
  ]],
];

export default function Blog() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Blog</h1>
        {POSTS.map(([title, date, excerpt, body]) => (
          <section key={title} className="mt-8 rounded-md border border-line bg-panel p-5">
            <p className="text-xs text-dim">{date}</p>
            <h2 className="mt-1 text-lg font-bold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-tungsten">{excerpt}</p>
            {body.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-muted">{p}</p>
            ))}
          </section>
        ))}
        <div className="mt-10">
          <Link to="/signup" className="inline-flex h-11 items-center rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110">
            Try it yourself
          </Link>
        </div>
      </article>
    </PublicShell>
  );
}
