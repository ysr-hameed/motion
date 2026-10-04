import { useState } from "react";
import {
  AlertTriangle, Check, ChevronDown, Clock, Code2, FileDiff, Layers,
  Loader2, MonitorPlay, Palette, ShieldCheck, Sparkles, XCircle,
} from "lucide-react";

/**
 * Rich per-tool visuals for the chat log.
 *
 * Every tool call renders a designed card instead of a raw dump: code tools
 * show code (writes) or diffs (edits), plan tools show beat timelines,
 * design tools show palettes/layout maps, and status tools show verdict
 * banners. In-flight calls show a skeleton with a per-tool verb, so waiting
 * reads as progress. Everything is fluid-width — the panel is ~400px on
 * desktop and full-width on mobile.
 */

export type AnyRec = Record<string, unknown>;

const str = (v: unknown, fb: unknown = ""): string =>
  typeof v === "string" ? v : typeof fb === "string" ? fb : typeof fb === "number" ? String(fb) : "";
const num = (v: unknown, fb = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function Card({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
  // Flush-left: the old ml-6 pushed every tool visual 24px right inside an
  // already-narrow panel, so content read cramped. Hierarchy comes from the
  // status rail + title row, not indentation.
  return (
    <div className={`mt-1.5 min-w-0 overflow-hidden rounded-xl border border-line/70 bg-ink/60 ${tone}`}>
      {children}
    </div>
  );
}

function Title({ icon, text, right }: { icon: React.ReactNode; text: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 pt-2 text-[10px] font-bold uppercase tracking-widest text-dim">
      <span className="text-tungsten" aria-hidden>{icon}</span>
      <span className="truncate">{text}</span>
      {right ? <span className="ml-auto shrink-0">{right}</span> : null}
    </div>
  );
}

/* ── pending ─────────────────────────────────────────────────────────── */

const VERBS: Record<string, [string, string]> = {
  quick_start: ["Writing code", "golden starter with springs, easing, clamps"],
  write_composition: ["Writing code", "full composition, one pass"],
  edit_file: ["Editing", "surgical find → replace"],
  bulk_edit: ["Editing", "batched ops, atomic"],
  plan_motion: ["Planning beats", "frames, props, easing"],
  creative_direct: ["Directing", "intent, palette, fonts, presets"],
  load_skill: ["Loading docs", "exact API reference"],
  load_motion_preset: ["Loading preset", "copy-paste timing numbers"],
  layout_plan: ["Planning layout", "positions + conflicts"],
  validate_composition: ["Checking", "static correctness pass"],
  verify_no_errors: ["Verifying", "blocking gate"],
  preview_composition: ["Publishing", "to the player"],
  read_render_report: ["Waiting for browser", "compile + mount verdict"],
  review_motion: ["Reviewing", "motion critique"],
  design_analyze: ["Scoring", "0–100 quality audit"],
  auto_fix_code: ["Repairing", "mechanical fixes"],
  auto_enhance_motion: ["Enhancing", "easing + clamps + stagger"],
  copy_generate: ["Writing copy", "headline deck"],
  font_suggest: ["Pairing fonts", "display + text"],
  pre_validate_plan: ["Pre-checking", "feasibility before code"],
  constraint_solve: ["Solving", "timing constraints"],
};

export function PendingView({ tool }: { tool: string }) {
  const [verb, hint] = VERBS[tool] ?? ["Working", "running the tool"];
  return (
    <div className="ml-6 mt-1.5 min-w-0 rounded-xl border border-line/70 bg-ink/60 px-2.5 py-2" aria-label={verb}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-paper">
        <Loader2 size={12} className="shrink-0 animate-spin text-tungsten" aria-hidden />
        <span className="truncate">{verb}<span className="animate-pulse">…</span></span>
        <span className="ml-auto hidden shrink-0 truncate text-[10px] font-normal text-dim sm:inline">{hint}</span>
      </div>
      {/* skeleton code lines with staggered shimmer — the "writing" feel */}
      <div className="mt-2 space-y-1.5" aria-hidden>
        {[92, 78, 64, 85, 45].map((w, i) => (
          <div
            key={i}
            className="h-2 animate-pulse rounded-full bg-white/10"
            style={{ width: `${w}%`, animationDelay: `${i * 180}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── code ────────────────────────────────────────────────────────────── */

function CodeBlock({ code, lines = 14 }: { code: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const all = code.split("\n");
  const shown = open ? all : all.slice(0, lines);
  return (
    <div>
      <pre className="scroll-thin overflow-x-auto px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-paper/90">
        <code>{shown.join("\n")}</code>
      </pre>
      {all.length > lines ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-line/60 py-1 text-[10px] font-semibold text-dim transition-colors hover:text-paper"
        >
          <ChevronDown size={11} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Show less" : `Show all ${all.length} lines`}
        </button>
      ) : null}
    </div>
  );
}

function WarnRows({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1 px-2.5 pb-2">
      {items.slice(0, 4).map((w, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[10.5px] leading-snug text-muted">
          <AlertTriangle size={11} className="mt-0.5 shrink-0 text-tungsten" aria-hidden />
          <span className="min-w-0">{w.length > 140 ? `${w.slice(0, 140)}…` : w}</span>
        </p>
      ))}
    </div>
  );
}

function CodeView({ output, title }: { output: AnyRec; title: string }) {
  const code = str(output.code);
  const repaired = arr<string>(output.autoRepaired);
  const warnings = arr<string>(output.warnings);
  return (
    <Card>
      <Title icon={<Code2 size={11} />} text={title} right={code ? <span className="text-dim">{code.split("\n").length} lines</span> : undefined} />
      {code ? (
        <div className="mt-1 border-t border-line/60">
          <CodeBlock code={code} />
        </div>
      ) : null}
      {repaired.length > 0 ? (
        <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] text-ok">
          <Sparkles size={11} className="shrink-0" aria-hidden />
          <span className="truncate">Auto-repaired: {repaired.join(" · ")}</span>
        </p>
      ) : null}
      <WarnRows items={warnings} />
    </Card>
  );
}

/* ── diff ────────────────────────────────────────────────────────────── */

interface EditOp {
  find?: string;
  replace?: string;
  all?: boolean;
}

function DiffView({ input, output }: { input: AnyRec; output: AnyRec }) {
  const ops = arr<EditOp>(input.ops);
  const failed = arr<{ find?: string; reason?: string }>(output.failed);
  const failedFinds = new Set(failed.map((f) => str(f.find).slice(0, 80)));
  const errors = arr<string>(output.errors);
  return (
    <Card>
      <Title
        icon={<FileDiff size={11} />}
        text={`Edit · ${ops.length} op${ops.length === 1 ? "" : "s"}`}
        right={
          output.ok ? (
            <span className="flex items-center gap-1 text-ok"><Check size={11} aria-hidden /> applied</span>
          ) : (
            <span className="flex items-center gap-1 text-bad"><XCircle size={11} aria-hidden /> blocked</span>
          )
        }
      />
      <div className="mt-1 space-y-1.5 border-t border-line/60 p-2">
        {ops.slice(0, 5).map((op, i) => {
          const find = str(op.find);
          const replace = str(op.replace);
          const missed = failedFinds.has(find.slice(0, 80));
          // Show the first DIFFERING line, not the first line: ops whose
          // head lines match (indentation-only context) used to render
          // identical red/green rows, reading as "both show the same code".
          const findLines = find.split("\n");
          const replaceLines = replace.split("\n");
          let diffAt = 0;
          while (
            diffAt < Math.min(findLines.length, replaceLines.length) &&
            findLines[diffAt] === replaceLines[diffAt]
          ) {
            diffAt++;
          }
          const noChange = find === replace;
          const beforeLine = findLines[Math.min(diffAt, findLines.length - 1)] ?? "";
          const afterLine = replaceLines[Math.min(diffAt, replaceLines.length - 1)] ?? "";
          const lineNo = diffAt + 1;
          return (
            <div key={i} className="overflow-hidden rounded-lg border border-line/60">
              <div className={`flex items-center gap-1 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${missed || noChange ? "bg-bad/10 text-bad" : "bg-white/[0.03] text-dim"}`}>
                {missed || noChange ? <XCircle size={10} aria-hidden /> : <Check size={10} aria-hidden className="text-ok" />}
                op {i + 1}{op.all ? " · all occurrences" : ""}{noChange ? " · no change" : ` · line ${lineNo}`}
              </div>
              {noChange ? (
                <pre className="scroll-thin overflow-x-auto bg-bad/[0.07] px-2 py-1 font-mono text-[10px] leading-relaxed text-bad/90">
                  <code>= identical — this op changes nothing and was refused</code>
                </pre>
              ) : (
                <>
                  <pre className="scroll-thin overflow-x-auto bg-bad/[0.07] px-2 py-1 font-mono text-[10px] leading-relaxed text-bad/90">
                    <code>- {beforeLine.slice(0, 90)}{findLines.length > 1 ? ` ⏎ L${lineNo}` : ""}</code>
                  </pre>
                  <pre className="scroll-thin overflow-x-auto bg-ok/[0.07] px-2 py-1 font-mono text-[10px] leading-relaxed text-ok/90">
                    <code>+ {replace ? `${afterLine.slice(0, 90)}${replaceLines.length > 1 ? ` ⏎ L${lineNo}` : ""}` : "(deleted)"}</code>
                  </pre>
                </>
              )}
            </div>
          );
        })}
        {ops.length > 5 ? <p className="text-center text-[10px] text-dim">+{ops.length - 5} more ops</p> : null}
      </div>
      {failed.length > 0 ? (
        <div className="space-y-1 px-2.5 pb-2">
          {failed.slice(0, 3).map((f, i) => (
            <p key={i} className="text-[10.5px] leading-snug text-bad/90">✕ {str(f.reason).slice(0, 130)}</p>
          ))}
        </div>
      ) : null}
      {errors.length > 0 ? (
        <div className="space-y-1 px-2.5 pb-2">
          {errors.slice(0, 3).map((e, i) => (
            <p key={i} className="text-[10.5px] leading-snug text-bad/90">✕ {e.slice(0, 130)}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* ── beats / plan ────────────────────────────────────────────────────── */

export interface Beat {
  from?: number;
  to?: number;
  what?: string;
}

function BeatBars({ beats }: { beats: Beat[] }) {
  const max = Math.max(1, ...beats.map((b) => num(b.to, 1)));
  return (
    <div className="space-y-1.5 px-2.5 py-2">
      {beats.slice(0, 8).map((b, i) => {
        const from = num(b.from);
        const to = Math.max(from + 1, num(b.to, from + 1));
        const left = (from / max) * 100;
        const width = Math.max(2, ((to - from) / max) * 100);
        return (
          <div key={i} className="min-w-0">
            <div className="flex items-baseline gap-1.5 text-[10px]">
              <span className="shrink-0 font-bold tabular-nums text-tungsten">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate text-muted" title={str(b.what)}>{str(b.what)}</span>
              <span className="shrink-0 tabular-nums text-dim">{from}–{to}f</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-tungsten/70 to-tungsten"
                style={{ marginLeft: `${Math.min(98, left)}%`, width: `${Math.min(100 - Math.min(98, left), width)}%` }}
              />
            </div>
          </div>
        );
      })}
      {beats.length > 8 ? <p className="text-[10px] text-dim">+{beats.length - 8} more beats</p> : null}
    </div>
  );
}

function PlanView({ output }: { output: AnyRec }) {
  const plan = (output.plan ?? output) as AnyRec;
  const beats = arr<Beat>(plan.beats);
  return (
    <Card>
      <Title icon={<Layers size={11} />} text={str(plan.title, "Motion plan")} right={<span className="text-dim">{beats.length} beats</span>} />
      {str(plan.intent) ? <p className="px-2.5 pt-1 text-[11px] leading-snug text-muted">{str(plan.intent)}</p> : null}
      {beats.length > 0 ? (
        <div className="mt-1 border-t border-line/60"><BeatBars beats={beats} /></div>
      ) : null}
      {str(plan.ending) ? <p className="border-t border-line/60 px-2.5 py-1.5 text-[10.5px] text-muted">→ {str(plan.ending)}</p> : null}
    </Card>
  );
}

/* ── validation / verify / render ────────────────────────────────────── */

function ErrRows({ items }: { items: string[] }) {
  return (
    <div className="space-y-1 px-2.5 pb-2">
      {items.slice(0, 4).map((e, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[10.5px] leading-snug text-bad/90">
          <XCircle size={11} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0">{e.length > 150 ? `${e.slice(0, 150)}…` : e}</span>
        </p>
      ))}
      {items.length > 4 ? <p className="text-[10px] text-dim">+{items.length - 4} more</p> : null}
    </div>
  );
}

function ValidateView({ output }: { output: AnyRec }) {
  const errors = arr<string>(output.errors);
  const warnings = arr<string>(output.warnings);
  const browser = output.browserError as AnyRec | undefined;
  const ok = !errors.length && !browser;
  return (
    <Card tone={ok ? "" : "border-bad/40"}>
      <Title
        icon={<ShieldCheck size={11} />}
        text="Validation"
        right={
          ok ? (
            <span className="flex items-center gap-1 text-ok"><Check size={11} aria-hidden /> clean</span>
          ) : (
            <span className="flex items-center gap-1 text-bad"><XCircle size={11} aria-hidden /> {errors.length + (browser ? 1 : 0)} errors</span>
          )
        }
      />
      <div className="mt-1 border-t border-line/60 pt-1.5">
        {browser ? (
          <p className="flex items-start gap-1.5 px-2.5 pb-1.5 text-[10.5px] leading-snug text-bad/90">
            <MonitorPlay size={11} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0">Browser: {str(browser.message).slice(0, 150)}</span>
          </p>
        ) : null}
        <ErrRows items={errors} />
        <WarnRows items={warnings} />
        {ok ? <p className="px-2.5 pb-2 text-[10.5px] text-dim">No errors{warnings.length ? ` · ${warnings.length} advisories` : ""} — safe to preview.</p> : null}
      </div>
    </Card>
  );
}

function VerifyView({ output }: { output: AnyRec }) {
  const ok = output.ok === true;
  const errors = arr<string>(output.errors);
  const advisory = arr<string>(output.advisory ?? output.warnings);
  return (
    <Card tone={ok ? "border-ok/30" : "border-bad/40"}>
      <div className={`flex items-center gap-2 px-2.5 py-2 ${ok ? "bg-ok/[0.07]" : "bg-bad/[0.07]"}`}>
        {ok ? <Check size={14} className="shrink-0 text-ok" aria-hidden /> : <XCircle size={14} className="shrink-0 text-bad" aria-hidden />}
        <p className={`text-[12px] font-bold ${ok ? "text-ok" : "text-bad"}`}>
          {ok ? "Gate passed — ready to preview" : "Blocked — fix first, do not preview"}
        </p>
      </div>
      {!ok ? (
        <div className="pt-1.5">
          <ErrRows items={errors} />
          {str(output.fixHint) ? <p className="px-2.5 pb-2 text-[10.5px] text-muted">→ {str(output.fixHint).slice(0, 160)}</p> : null}
        </div>
      ) : advisory.length > 0 ? (
        <div className="pt-1.5"><WarnRows items={advisory} /></div>
      ) : null}
    </Card>
  );
}

function RenderView({ output }: { output: AnyRec }) {
  const status = str(output.status);
  const findings = arr<string>(output.findings);
  if (status === "verified") {
    return (
      <Card tone="border-ok/30">
        <div className="flex items-center gap-2 bg-ok/[0.07] px-2.5 py-2">
          <MonitorPlay size={14} className="shrink-0 text-ok" aria-hidden />
          <p className="text-[12px] font-bold text-ok">Verified in the browser</p>
        </div>
        {str(output.detail) ? <p className="px-2.5 py-1.5 text-[10.5px] text-muted">{str(output.detail).slice(0, 160)}</p> : null}
        {findings.length > 0 ? (
          <div className="border-t border-line/60 pt-1.5"><WarnRows items={findings} /></div>
        ) : (
          <p className="px-2.5 pb-2 text-[10.5px] text-dim">Compiled, mounted, no layout issues.</p>
        )}
      </Card>
    );
  }
  if (status === "failed") {
    return (
      <Card tone="border-bad/40">
        <div className="flex items-center gap-2 bg-bad/[0.07] px-2.5 py-2">
          <XCircle size={14} className="shrink-0 text-bad" aria-hidden />
          <p className="text-[12px] font-bold text-bad">Browser render failed</p>
        </div>
        <p className="px-2.5 py-1.5 font-mono text-[10.5px] leading-snug text-bad/90">{str(output.message).slice(0, 220)}</p>
        {str(output.fixHint) ? <p className="px-2.5 pb-2 text-[10.5px] text-muted">→ {str(output.fixHint).slice(0, 180)}</p> : null}
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <Clock size={13} className="shrink-0 animate-pulse text-tungsten" aria-hidden />
        <p className="text-[11.5px] font-semibold text-paper">Render unconfirmed</p>
      </div>
      <p className="px-2.5 pb-2 text-[10.5px] text-dim">{str(output.hint, "The browser stayed silent — never claim it works.").slice(0, 160)}</p>
    </Card>
  );
}

/* ── review / fixes ──────────────────────────────────────────────────── */

function FindingRows({ items, icon }: { items: string[]; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1 px-2.5 py-2">
      {items.slice(0, 5).map((f, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[10.5px] leading-snug text-muted">
          <span className="mt-0.5 shrink-0 font-bold text-tungsten" aria-hidden>{icon ?? "→"}</span>
          <span className="min-w-0">{f.length > 170 ? `${f.slice(0, 170)}…` : f}</span>
        </p>
      ))}
      {items.length > 5 ? <p className="text-[10px] text-dim">+{items.length - 5} more</p> : null}
    </div>
  );
}

function ReviewView({ output }: { output: AnyRec }) {
  const findings = arr<string>(output.findings);
  const score = num((output as AnyRec).score, -1);
  return (
    <Card>
      <Title
        icon={<Sparkles size={11} />}
        text="Motion review"
        right={score >= 0 ? <span className="font-mono text-[11px] text-tungsten">{score}/100</span> : undefined}
      />
      <div className="mt-1 border-t border-line/60"><FindingRows items={findings} /></div>
    </Card>
  );
}

interface Fix {
  issue?: string;
  fix?: string;
  confidence?: string;
  preview?: { before?: string; after?: string };
}

function FixView({ output }: { output: AnyRec }) {
  const applied = arr<Fix>(output.applied);
  const suggested = arr<Fix>(output.suggested);
  const remaining = arr<string>(output.remaining);
  const enhancements = arr<string>(output.enhancements);
  return (
    <Card>
      <Title icon={<Check size={11} />} text={output.ok ? "Fixed" : "Fix attempt"} />
      {applied.length > 0 ? (
        <div className="mt-1 space-y-1 border-t border-line/60 p-2">
          {applied.slice(0, 5).map((f, i) => (
            <div key={i} className="rounded-lg bg-ok/[0.06] px-2 py-1.5">
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-paper">
                <Check size={11} className="shrink-0 text-ok" aria-hidden />
                <span className="min-w-0 truncate">{str(f.issue)}</span>
                {str(f.confidence) ? (
                  <span className={`ml-auto shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold ${f.confidence === "high" ? "bg-ok/15 text-ok" : "bg-tungsten/15 text-tungsten"}`}>
                    {str(f.confidence)}
                  </span>
                ) : null}
              </p>
              {str(f.fix) ? <p className="mt-0.5 truncate pl-4 text-[10px] text-dim" title={str(f.fix)}>→ {str(f.fix)}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {enhancements.length > 0 ? (
        <div className="border-t border-line/60"><FindingRows items={enhancements} icon="+" /></div>
      ) : null}
      {suggested.length > 0 ? (
        <div className="border-t border-line/60 px-2.5 py-1.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-dim">Needs your call</p>
          {suggested.slice(0, 3).map((f, i) => (
            <p key={i} className="truncate text-[10.5px] text-muted" title={`${str(f.issue)} — ${str(f.fix)}`}>
              △ {str(f.issue)} <span className="text-dim">— {str(f.fix).slice(0, 80)}</span>
            </p>
          ))}
        </div>
      ) : null}
      {remaining.length > 0 ? <div className="border-t border-line/60 pt-1.5"><ErrRows items={remaining} /></div> : null}
      {str(output.note) && !output.ok ? <p className="px-2.5 pb-2 text-[10.5px] text-muted">{str(output.note).slice(0, 160)}</p> : null}
    </Card>
  );
}

/* ── versions ────────────────────────────────────────────────────────── */

function VersionsView({ output }: { output: AnyRec }) {
  const versions = arr<{ n?: number; lines?: number; title?: string | null }>(output.versions);
  const current = num(output.current);
  const items = versions.slice(-6).reverse();
  return (
    <Card>
      <Title icon={<Layers size={11} />} text="Versions" right={<span className="text-dim">current v{current}</span>} />
      <div className="mt-1 space-y-px border-t border-line/60 p-1.5">
        {items.map((v) => {
          const n = num(v.n);
          const isCur = n === current;
          return (
            <div key={n} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] ${isCur ? "bg-tungsten/10" : ""}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isCur ? "bg-tungsten" : "bg-white/20"}`} aria-hidden />
              <span className={`font-bold tabular-nums ${isCur ? "text-paper" : "text-muted"}`}>v{n}</span>
              <span className="min-w-0 flex-1 truncate text-dim">{str(v.title) || "untitled cut"}</span>
              <span className="shrink-0 tabular-nums text-dim">{num(v.lines)}L</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── design: palette, preset, layout, fonts, copy ────────────────────── */

function PaletteView({ output }: { output: AnyRec }) {
  const palette = (output.palette ?? {}) as AnyRec;
  const fonts = (output.fonts ?? {}) as AnyRec;
  const beats = arr<{ beat?: string; preset?: string; duration?: number; easing?: string }>(output.beats);
  const accents = arr<string>(palette.accents);
  return (
    <Card>
      <Title icon={<Palette size={11} />} text="Art direction" />
      <div className="mt-1 flex items-center gap-1.5 border-t border-line/60 px-2.5 py-2">
        {[str(palette.bg), str(palette.ink), ...accents].filter(Boolean).slice(0, 5).map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="h-6 w-6 rounded-lg border border-white/15" style={{ backgroundColor: c }} title={c} />
          </span>
        ))}
        <span className="ml-1 min-w-0 flex-1 truncate font-mono text-[10px] text-dim">{str(palette.bg)} · {str(palette.ink)}</span>
      </div>
      {(str(fonts.display) || str(fonts.text)) ? (
        <div className="flex flex-wrap gap-1.5 border-t border-line/60 px-2.5 py-2">
          {str(fonts.display) ? <span className="rounded-full bg-panel-3 px-2 py-0.5 text-[10.5px] font-bold text-paper">Aa {str(fonts.display)}</span> : null}
          {str(fonts.text) ? <span className="rounded-full bg-panel-3 px-2 py-0.5 text-[10.5px] text-muted">Aa {str(fonts.text)}</span> : null}
        </div>
      ) : null}
      {beats.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-t border-line/60 px-2.5 py-2">
          {beats.slice(0, 8).map((b, i) => (
            <span key={i} className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted" title={`${str(b.preset)} · ${str(b.easing)} · ${num(b.duration)}f`}>
              {str(b.beat)}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function PresetView({ output, input }: { output: AnyRec; input: AnyRec }) {
  const preset = (output.preset ?? {}) as AnyRec;
  const timing = (output.timing ?? {}) as AnyRec;
  return (
    <Card>
      <Title icon={<Sparkles size={11} />} text={str(output.id, str(input.beatType, "Motion preset"))} />
      <p className="px-2.5 pt-1 text-[11px] leading-snug text-muted">{str(preset.feel).slice(0, 140)}</p>
      <div className="flex flex-wrap gap-1.5 px-2.5 py-2">
        <span className="rounded-md bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] text-paper">{str(timing.easing ?? preset.easing).slice(0, 34)}</span>
        <span className="rounded-md bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] text-muted">{num(timing.duration ?? preset.duration)}f</span>
        {timing.stagger ?? (preset as AnyRec).stagger ? <span className="rounded-md bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] text-muted">±{num((timing.stagger ?? (preset as AnyRec).stagger) as number)}f stagger</span> : null}
      </div>
      {str(output.note) ? <p className="border-t border-line/60 px-2.5 py-1.5 text-[10.5px] text-dim">{str(output.note).slice(0, 150)}</p> : null}
    </Card>
  );
}

interface PlacedBox {
  id?: string;
  type?: string;
  bounds?: { x?: number; y?: number; width?: number; height?: number };
  zIndex?: number;
}

function LayoutView({ output }: { output: AnyRec }) {
  const boxes = arr<PlacedBox>(output.layout);
  const conflicts = arr<{ type?: string; elements?: string[]; fix?: string }>(output.conflicts);
  const W = 1920;
  const H = 1080;
  const colors = ["#D7FF3F", "#7DD3FC", "#FDA4AF", "#FCD34D", "#C4B5FD"];
  return (
    <Card>
      <Title icon={<Layers size={11} />} text="Layout map" right={<span className="text-dim">{boxes.length} elements</span>} />
      <div className="px-2.5 pt-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line/60 bg-black/60">
          {boxes.map((b, i) => {
            const bd = b.bounds ?? {};
            const left = Math.max(0, Math.min(100, (num(bd.x) / W) * 100));
            const top = Math.max(0, Math.min(100, (num(bd.y) / H) * 100));
            const w = Math.max(3, Math.min(100 - left, (num(bd.width, 100) / W) * 100));
            const h = Math.max(4, Math.min(100 - top, (num(bd.height, 60) / H) * 100));
            const c = colors[i % colors.length]!;
            return (
              <div
                key={str(b.id, i)}
                className="absolute flex items-center justify-center overflow-hidden rounded-[3px] border text-[8px] font-bold"
                style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%`, borderColor: c, backgroundColor: `${c}22`, color: c }}
                title={`${str(b.id)} · ${num(bd.width)}×${num(bd.height)} @ ${num(bd.x)},${num(bd.y)} · z${num(b.zIndex)}`}
              >
                <span className="truncate px-0.5">{str(b.id)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {conflicts.length > 0 ? (
        <div className="mt-1.5 space-y-1 border-t border-line/60 px-2.5 py-2">
          {conflicts.slice(0, 3).map((c, i) => (
            <p key={i} className="text-[10.5px] leading-snug text-tungsten">
              ⚠ {str(c.type)}: {(c.elements ?? []).join(" × ") || "elements"}
              <span className="block truncate text-dim" title={str(c.fix)}>{str(c.fix).slice(0, 120)}</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-1 px-2.5 py-1.5 text-[10.5px] text-ok"><Check size={11} aria-hidden /> no overlaps, inside safe margins</p>
      )}
    </Card>
  );
}

function FontView({ output }: { output: AnyRec }) {
  return (
    <Card>
      <Title icon={<Palette size={11} />} text={`Fonts · ${str(output.mood, "pairing")}`} />
      <div className="mt-1 grid grid-cols-2 gap-1.5 border-t border-line/60 p-2">
        {[
          { k: "Display", v: str(output.display) },
          { k: "Text", v: str(output.text) },
        ].map((f) => (
          <div key={f.k} className="min-w-0 rounded-lg bg-white/[0.03] px-2 py-1.5 text-center">
            <p className="truncate text-lg font-bold leading-tight text-paper" style={{ fontFamily: `'${f.v}', sans-serif` }}>Ag</p>
            <p className="truncate text-[10px] font-semibold text-tungsten">{f.v}</p>
            <p className="text-[9px] uppercase tracking-wider text-dim">{f.k}</p>
          </div>
        ))}
      </div>
      <p className="scroll-thin overflow-x-auto whitespace-nowrap px-2.5 pb-2 font-mono text-[10px] text-dim">{str(output.css)}</p>
    </Card>
  );
}

function CopyView({ output }: { output: AnyRec }) {
  const heads = arr<string>(output.headlines);
  const tags = arr<string>(output.taglines);
  return (
    <Card>
      <Title icon={<Sparkles size={11} />} text="Copy deck — pick one pair" />
      <div className="mt-1 space-y-1.5 border-t border-line/60 p-2">
        {heads.slice(0, 3).map((h, i) => (
          <div key={i} className="rounded-lg bg-white/[0.03] px-2 py-1.5">
            <p className="text-[12px] font-bold leading-snug text-paper">{h}</p>
            {tags[i] ? <p className="mt-0.5 text-[10.5px] text-dim">{tags[i]}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function MusicView({ output }: { output: AnyRec }) {
  const matches = arr<{ title?: string; bpm?: number; seconds?: number; trim?: string }>(output.matches);
  return (
    <Card>
      <Title icon={<Clock size={11} />} text="Music beds" />
      <div className="mt-1 space-y-1.5 border-t border-line/60 p-2">
        {matches.slice(0, 3).map((t, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5">
            <span className="flex h-7 w-7 shrink-0 items-end justify-center gap-[2px] rounded-md bg-tungsten/15 pb-1" aria-hidden>
              {[5, 9, 6, 11].map((h, j) => (
                <span key={j} className="w-[3px] rounded-sm bg-tungsten" style={{ height: `${h + (i * 2 + j) % 4}px` }} />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-semibold text-paper">{str(t.title)}</span>
              <span className="block truncate text-[10px] tabular-nums text-dim">{num(t.bpm)} BPM · {num(t.seconds)}s — {str(t.trim).slice(0, 60)}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function VoiceView({ output }: { output: AnyRec }) {
  const cues = arr<{ at?: number; text?: string }>(output.cues);
  const max = Math.max(1, ...cues.map((c) => num(c.at, 1)));
  return (
    <Card>
      <Title
        icon={<Clock size={11} />}
        text="Voiceover timing"
        right={<span className="tabular-nums text-dim">{num(output.words)} words · ~{num(output.estSeconds)}s</span>}
      />
      <div className="mt-1 border-t border-line/60 px-2.5 py-2">
        <div className="flex h-8 items-end gap-[2px]" aria-hidden>
          {cues.slice(0, 40).map((c, i) => (
            <div
              key={i}
              className="min-w-[2px] flex-1 rounded-sm bg-tungsten/70"
              style={{ height: `${25 + ((c.text?.length ?? 0) * 7) % 75}%` }}
              title={`f${num(c.at)}: ${str(c.text)}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9.5px] tabular-nums text-dim">
          <span>f0</span><span>f{max}</span>
        </div>
      </div>
    </Card>
  );
}

function AssetView({ output }: { output: AnyRec }) {
  const results = arr<{ type?: string; url?: string; note?: string; attribution?: string }>(output.results);
  return (
    <Card>
      <Title icon={<Layers size={11} />} text={`Assets · ${str(output.query)}`} />
      <div className="mt-1 space-y-1.5 border-t border-line/60 p-2">
        {results.slice(0, 3).map((r, i) => (
          <div key={i} className="rounded-lg bg-white/[0.03] px-2 py-1.5">
            <p className="truncate font-mono text-[10px] text-tungsten" title={str(r.url)}>{str(r.url).slice(0, 70)}</p>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-dim">{str(r.note).slice(0, 140)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SnippetView({ output, title }: { output: AnyRec; title: string }) {
  const snippet = str(output.snippet ?? output.textSnippet ?? output.code ?? output.content);
  const icons = arr<string>(output.icons);
  return (
    <Card>
      <Title icon={<Code2 size={11} />} text={title} />
      {icons.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-2.5 pt-1.5">
          {icons.slice(0, 5).map((n, i) => (
            <span key={i} className="rounded-md bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] text-paper">{n}</span>
          ))}
        </div>
      ) : null}
      {snippet ? (
        <div className="mt-1 border-t border-line/60"><CodeBlock code={snippet} lines={10} /></div>
      ) : (
        <p className="px-2.5 py-2 text-[10.5px] text-dim">Ready — copy the snippet into the composition.</p>
      )}
    </Card>
  );
}

function CanvasView({ output }: { output: AnyRec }) {
  return (
    <div className="ml-6 mt-1.5 flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-line/70 bg-ink/60 px-2.5 py-2">
      <span className="relative aspect-video w-14 shrink-0 overflow-hidden rounded-md border border-tungsten/50 bg-black" aria-hidden>
        <span className="absolute inset-1 rounded-[3px] border border-dashed border-white/25" />
      </span>
      <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-paper">
        {num(output.width, 1920)}×{num(output.height, 1080)} <span className="text-dim">@ {num(output.fps, 30)}fps · ≤{num(output.maxFrames, 900)}f</span>
      </p>
    </div>
  );
}

function AnyList({ items }: { items: unknown[] }) {
  const rows = items.slice(0, 6);
  return (
    <div className="space-y-1">
      {rows.map((raw, i) => {
        if (typeof raw === "string") {
          return <p key={i} className="truncate text-[10.5px] text-muted" title={raw}>· {raw.slice(0, 120)}</p>;
        }
        if (raw && typeof raw === "object") {
          const r = raw as AnyRec;
          // execute_batch result rows
          if (r.tool !== undefined && (r.ok !== undefined || r.result !== undefined || r.error !== undefined)) {
            const ok = r.ok === true;
            const detail = r.ok === true
              ? summarizeResult(r.result as AnyRec)
              : str(r.error).slice(0, 80);
            return (
              <div key={i} className="flex min-w-0 items-center gap-1.5 text-[10.5px]">
                {ok
                  ? <Check size={11} className="shrink-0 text-ok" aria-hidden />
                  : <XCircle size={11} className="shrink-0 text-bad" aria-hidden />}
                <span className="shrink-0 font-semibold text-paper">{str(r.tool).replace(/_/g, " ")}</span>
                {detail ? <span className="min-w-0 flex-1 truncate text-dim" title={detail}>{detail}</span> : null}
              </div>
            );
          }
          // dependency_resolve rows
          if (r.source !== undefined && r.status !== undefined) {
            const ok = r.status === "ok";
            return (
              <div key={i} className="flex min-w-0 items-center gap-1.5 text-[10.5px]">
                {ok
                  ? <Check size={11} className="shrink-0 text-ok" aria-hidden />
                  : <AlertTriangle size={11} className="shrink-0 text-tungsten" aria-hidden />}
                <span className="shrink-0 font-mono text-muted">{str(r.source)}</span>
                <span className="min-w-0 flex-1 truncate text-dim" title={str(r.hint)}>{str(r.hint).slice(0, 100)}</span>
              </div>
            );
          }
          // generic object: first two scalar fields
          const fields = Object.entries(r).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)).slice(0, 2);
          return (
            <p key={i} className="truncate text-[10.5px] text-muted">
              · {fields.map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join("  ")}
            </p>
          );
        }
        return null;
      })}
      {items.length > 6 ? <p className="text-[10px] text-dim">+{items.length - 6} more</p> : null}
    </div>
  );
}

function summarizeResult(result: AnyRec | unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as AnyRec;
  if (typeof r.note === "string") return r.note.slice(0, 90);
  if (typeof r.message === "string") return r.message.slice(0, 90);
  if (Array.isArray(r.beats)) return `${r.beats.length} beats`;
  if (Array.isArray(r.findings)) return `${r.findings.length} findings`;
  if (typeof r.version === "number") return "saved";
  if (r.ok === true) return "done";
  return "";
}

function KeyGrid({ output, title }: { output: AnyRec; title: string }) {
  const entries = Object.entries(output)
    .filter(([k, v]) => !/^(ok|version|plan|code|next|beats|findings|errors|warnings)$/.test(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
    .slice(0, 6);
  const lists = Object.entries(output)
    .filter(([, v]) => Array.isArray(v) && (v as unknown[]).length > 0)
    .slice(0, 3);
  if (entries.length === 0 && lists.length === 0) return null;
  return (
    <Card>
      <Title icon={<Sparkles size={11} />} text={title} />
      <div className="mt-1 space-y-1.5 border-t border-line/60 px-2.5 py-2">
        {lists.map(([k, v]) => (
          <div key={k}>
            <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-dim">
              {k.replace(/([A-Z])/g, " $1").trim()} · {(v as unknown[]).length}
            </p>
            <AnyList items={v as unknown[]} />
          </div>
        ))}
        {entries.length > 0 ? (
          <dl className="space-y-1">
            {entries.map(([k, v]) => (
              <div key={k} className="flex min-w-0 items-baseline gap-2 text-[10.5px]">
                <dt className="shrink-0 font-bold uppercase tracking-wider text-dim" style={{ fontSize: 9 }}>{k.replace(/([A-Z])/g, " $1").trim()}</dt>
                <dd className="min-w-0 flex-1 truncate text-muted" title={String(v)}>{String(v).slice(0, 120)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </Card>
  );
}

/* ── router ──────────────────────────────────────────────────────────── */

export function ToolVisual({ tool, input, output }: { tool: string; input: AnyRec; output: AnyRec }) {
  switch (tool) {
    case "quick_start":
    case "write_composition":
      return <CodeView output={output} title={tool === "quick_start" ? "Golden starter published" : "Composition written"} />;
    case "read_file":
      return <CodeView output={output} title={`Source · v${num(output.version)}`} />;
    case "edit_file":
    case "bulk_edit":
      return <DiffView input={input} output={output} />;
    case "plan_motion":
      return <PlanView output={output} />;
    case "validate_composition":
      return <ValidateView output={output} />;
    case "verify_no_errors":
      return <VerifyView output={output} />;
    case "preview_composition":
      return (
        <Card>
          <div className="flex items-center gap-2 px-2.5 py-2">
            <MonitorPlay size={14} className="shrink-0 text-tungsten" aria-hidden />
            <p className="text-[12px] font-bold text-paper">Published to the player</p>
          </div>
          <p className="px-2.5 pb-2 text-[10.5px] text-dim">{str(output.next, "The browser still has to compile and mount it.").slice(0, 160)}</p>
        </Card>
      );
    case "read_render_report":
      return <RenderView output={output} />;
    case "review_motion":
    case "design_analyze":
    case "performance_profile":
    case "accessibility_audit":
      return <ReviewView output={output} />;
    case "auto_fix_code":
    case "auto_enhance_motion":
      return <FixView output={output} />;
    case "list_versions":
    case "activity_log":
      return <VersionsView output={output} />;
    case "restore_version":
      return (
        <Card>
          <div className="flex items-center gap-2 px-2.5 py-2">
            <Check size={14} className="shrink-0 text-ok" aria-hidden />
            <p className="text-[12px] font-bold text-paper">Restored v{num(output.restoredFrom)} → v{num(output.newVersion)}</p>
          </div>
        </Card>
      );
    case "creative_direct":
      return <PaletteView output={output} />;
    case "load_motion_preset":
      return <PresetView output={output} input={input} />;
    case "layout_plan":
      return <LayoutView output={output} />;
    case "pre_validate_plan":
    case "constraint_solve": {
      const beats = arr<Beat>(output.suggestedBeats ?? output.beats);
      const issues = arr<string>(output.issues);
      return (
        <Card>
          <Title icon={<Clock size={11} />} text={output.ok ? "Timing works" : "Timing needs a fix"} />
          {str(output.note ?? output.budget) ? <p className="px-2.5 pt-1 text-[11px] text-muted">{str(output.note ?? output.budget).slice(0, 160)}</p> : null}
          {issues.length > 0 ? <div className="pt-1"><ErrRows items={issues} /></div> : null}
          {beats.length > 0 ? <div className="border-t border-line/60"><BeatBars beats={beats} /></div> : null}
        </Card>
      );
    }
    case "copy_generate":
      return <CopyView output={output} />;
    case "font_suggest":
      return <FontView output={output} />;
    case "music_search":
      return <MusicView output={output} />;
    case "voiceover_generate":
      return <VoiceView output={output} />;
    case "subtitle_generate": {
      const caps = arr<{ from?: number; to?: number; text?: string }>(output.captions);
      const max = Math.max(1, ...caps.map((c) => num(c.to, 1)));
      return (
        <Card>
          <Title icon={<Clock size={11} />} text={`Captions · ${str(output.language)}`} right={<span className="text-dim">{caps.length} cues</span>} />
          <div className="mt-1 space-y-1 border-t border-line/60 p-2">
            {caps.slice(0, 5).map((c, i) => (
              <div key={i} className="min-w-0">
                <div className="flex items-baseline gap-1.5 text-[10px]">
                  <span className="shrink-0 tabular-nums text-tungsten">f{num(c.from)}</span>
                  <span className="min-w-0 flex-1 truncate text-paper">{str(c.text)}</span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full bg-tungsten/70" style={{ marginLeft: `${(num(c.from) / max) * 100}%`, width: `${Math.max(2, ((num(c.to) - num(c.from)) / max) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      );
    }
    case "asset_search":
      return <AssetView output={output} />;
    case "asset_optimize":
      return (
        <Card>
          <Title icon={<Check size={11} />} text="Asset optimized" />
          <p className="mt-1 truncate border-t border-line/60 px-2.5 pt-1.5 font-mono text-[10px] text-tungsten" title={str(output.optimized)}>{str(output.optimized).slice(0, 80)}</p>
          <p className="px-2.5 py-1.5 text-[10.5px] leading-snug text-dim">{str(output.guidance).slice(0, 180)}</p>
        </Card>
      );
    case "icon_generate":
      return <SnippetView output={output} title={`Icons · ${str(output.concept)}`} />;
    case "background_generate":
      return <SnippetView output={output} title={`Background · ${str(output.style, "procedural")}`} />;
    case "load_skill":
      return (
        <div className="ml-6 mt-1.5 flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-line/70 bg-ink/60 px-2.5 py-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-tungsten/15 text-[11px] font-bold text-tungsten" aria-hidden>⊞</span>
          <p className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-paper">{str(input.id, str((output as AnyRec).id, "skill"))}</p>
          <span className="shrink-0 text-[10px] tabular-nums text-dim">{Math.round(str(output.content).length / 1000)}k doc</span>
        </div>
      );
    case "get_canvas":
      return <CanvasView output={output} />;
    case "sound_effects_library":
      return (
        <Card>
          <Title icon={<Clock size={11} />} text={`SFX · ${str(output.action, input.action)}`} />
          <div className="mt-1 border-t border-line/60"><FindingRows items={arr<string>(output.suggestions)} icon="♪" /></div>
        </Card>
      );
    case "export_preset":
    case "export_bundle":
    case "thumbnail_generate":
    case "watermark_apply":
    case "cdn_publish":
    case "intent_deep_analyze":
    case "intent_questionnaire":
    case "decision_make":
    case "preference_apply":
    case "brand_learn":
    case "dependency_resolve":
    case "blackboard_write":
    case "blackboard_read":
    case "blackboard_list":
    case "execute_batch":
    case "prefetch_tools":
    case "three_scene_create":
    case "three_camera_path":
    case "three_model_animate":
    case "share_create":
    case "comment_add":
    case "feedback_request":
    case "team_invite":
    case "version_tag":
    case "template_save":
    case "analytics_track":
      return <KeyGrid output={output} title={tool.replace(/_/g, " ")} />;
    default:
      return <KeyGrid output={output} title={tool.replace(/_/g, " ")} />;
  }
}
