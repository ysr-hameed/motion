import { Link } from "react-router-dom";
import { Stage } from "~/components/Stage";
import { PublicShell } from "~/components/layout";
import { DEMO_CODE, DEMO_PLAN } from "~/lib/demo";

/**
 * Public interactive demo: a real cut through the real browser compile path
 * and player — no account, no model quota spent.
 */
export default function Demo() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-center text-2xl font-bold tracking-tight md:text-3xl">
          Watch a real cut render
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          This preview is compiled live in your browser — the same pipeline the agent writes to.
        </p>
        <div className="mt-6 h-[52vh] min-h-80">
          <Stage code={DEMO_CODE} plan={DEMO_PLAN} version={1} reloadKey="demo" sessionId="demo" />
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center rounded-md bg-tungsten px-6 font-semibold text-ink hover:brightness-110"
          >
            Make yours — free
          </Link>
          <Link
            to="/features"
            className="inline-flex h-11 items-center rounded-md border border-line px-6 hover:bg-panel"
          >
            See features
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
