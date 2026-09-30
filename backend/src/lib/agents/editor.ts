import { STEP_BUDGETS } from "../models"
import { callGateway, type GatewayImage } from "./gateway-client"
import { isSmallComposition } from "../code-block"
import { applyEdits, coerceOps, describeFailure, type EditOp } from "./edit-ops"
import { buildKnowledge } from "../remotion-skills"
import { contractsFor, fontRules, EDIT_RULES } from "../remotion-guide"
import { fontCatalogue } from "../font-catalogue.generated"
 
/**
 * EDITOR — applies a change note to an existing composition.
 *
 * Two strategies, chosen by cost:
 *
 *   OPS      small JSON array of find/replace operations. A few hundred
 *            tokens regardless of file size. The default for anything
 *            that is not structural.
 *   REWRITE  the whole file again. Reserved for structural changes and
 *            for when ops miss.
 *
 * A miss is not a failure: the editor falls through to a rewrite so a
 * request is never dropped just because the model quoted the wrong three
 * lines. The user always gets a version, and the reply says which path
 * ran so nobody is misled about what changed.
 *
 * The ops call deliberately gets NO Remotion reference. Quoting three
 * lines of an existing file does not require 25 KB of documentation, and
 * that is the whole point of the ops path. The rewrite call — the rare
 * one — gets the full knowledge, because writing a composition does.
 */

export interface EditOutcome {
  code: string
  reply: string
  /** "ops" = surgical edit, "rewrite" = whole file re-emitted. */
  strategy: "ops" | "rewrite" | "failed"
  /** Ops that did not land (only set on a partial ops pass). */
  misses: string[]
}

const EDITOR_SYSTEM = [
  "You are the EDITOR of a motion studio. One composition exists. Apply the user's change to it.",
  "Never redesign, never re-conceptualise, never start over unless the note asks for it.",
  "",
  "TWO OUTPUT FORMS. Choose the cheaper one that fully does the job.",
  "",
  "FORM 1 — OPS (default, use for ~90% of requests):",
  "Output ONLY raw JSON, no fences:",
  '{reply, ops: [{op, ...}]}',
  "reply: one sentence, max 25 words, in the user's language, naming exactly what you changed. Never describe the UI, never say \"JSON\", never mention ops.",
  "ops — each is one of:",
  '  {op:"replace", find:"exact text from the file", replace:"new text"}',
  '  {op:"replaceAll", find:"...", replace:"..."}',
  '  {op:"insertAfter", anchor:"exact text from the file", text:"lines to add after it"}',
  '  {op:"insertBefore", anchor:"exact text from the file", text:"lines to add before it"}',
  '  {op:"delete", find:"exact text to remove"}',
  "",
  "RULES for ops:",
  "- `find`/`anchor` must be copied VERBATIM from the file, including indentation.",
  "- Keep each find SHORT — one line or one short block. A long find is",
  "  the usual reason an op misses.",
  "- Quote the SAME text every time if you replace it in several places,",
  "  and use replaceAll for that.",
  "- 1 to 8 ops. More than 8 means you should be rewriting.",
  "- Never emit an op you are not certain about. A wrong op is worse than none.",
  "",
  "FORM 2 — REWRITE (only when the change is structural):",
  "Use a rewrite when the note adds or removes a scene, changes the whole",
  "concept, restructures the timeline, or a rewrite is simply smaller than",
  "the ops. Output ONLY raw JSON:",
  '{reply, code: "<the full file as a TypeScript string>"}',
  "Reply is one sentence in the user's language. Keep the file's good parts",
  "— this is an edit, not a fresh design.",
  "",
  "EXAMPLES",
  'note: \"make it faster\" → ops replacing a duration or interpolating over a shorter range.',
  'note: \"use a red hero colour\" → ops replacing the hero hex.',
  'note: \"add a subtitle under the title\" → ops: insertAfter on the title element.',
  'note: \"make it 3 scenes instead of 1\" → rewrite.',
].join("\n")

interface EditorPayload {
  reply?: string
  ops?: unknown
  code?: unknown
}

function coercePayload(raw: unknown): EditorPayload {
  if (typeof raw !== "object" || raw === null) return {}
  let r = raw as Record<string, unknown>
  for (const key of ["result", "data", "response", "output"]) {
    const inner = r[key]
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      r = inner as Record<string, unknown>
      break
    }
  }
  return {
    reply: typeof r.reply === "string" ? r.reply : typeof r.message === "string" ? r.message : undefined,
    ops: r.ops ?? r.edits ?? r.operations,
    code: r.code ?? r.file ?? r.source ?? r.component,
  }
}

/** Normalises whatever the model called its reply into one clean line. */
function replyFrom(raw: string): string {
  const t = raw.trim().replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, " ")
  if (t.length < 3) return "Applied your note — saved as a new version."
  return t.length > 240 ? `${t.slice(0, 240).trimEnd()}…` : t
}

export async function runEditor(args: {
  model: string
  apiKey: string
  code: string
  note: string
  brief: string
  /** The stage this composition renders into, for the rewrite path. */
  canvas?: { width: number; height: number; fps: number; durationInFrames: number }
  /** Recent conversation, newest last — lets "that" resolve. */
  history: string
  memoryHint?: string
  stream?: boolean
  onToken?: (tokens: number) => void
  onDelta?: (delta: string) => void
  images?: GatewayImage[]
  fallbackModels?: string[]
  onModel?: (model: string) => void
}): Promise<EditOutcome> {
  const small = isSmallComposition(args.code)
  const user = [
    `ORIGINAL BRIEF\n"${args.brief}"`,
    `CHANGE REQUEST\n"${args.note}"`,
    args.history ? `RECENT CONVERSATION\n${args.history.slice(-1500)}` : "",
    `CURRENT FILE (${args.code.split("\n").length} lines)\n${args.code}`,
    args.memoryHint ? `HOUSE DIRECTION\n${args.memoryHint}` : "",
    small
      ? "This file is small enough that a full rewrite is cheap — use ops only if the change is a single surgical tweak."
      : "This file is large. Strongly prefer ops; a rewrite re-spends every token in the file.",
    args.images?.length ? `${args.images.length} reference image(s) attached.` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  let payload: EditorPayload = {}
  try {
    const { result, model: served } = await callGateway<unknown>({
      model: args.model,
      apiKey: args.apiKey,
      system: `${EDITOR_SYSTEM}\n\n${EDIT_RULES}`,
      user,
      budget: STEP_BUDGETS.editor,
      opts: {
        stream: args.stream,
        onToken: args.onToken,
        onDelta: args.onDelta,
        images: args.images,
        fallbackModels: args.fallbackModels,
      },
    })
    args.onModel?.(served)
    payload = coercePayload(result)
  } catch {
    return { code: args.code, reply: "", strategy: "failed", misses: [] }
  }

  const reply = replyFrom(payload.reply ?? "")

  // Rewrite path: accept only when it really is a full file.
  const fullCode = typeof payload.code === "string" ? payload.code.trim() : ""
  if (fullCode.length > 40) {
    return { code: fullCode, reply, strategy: "rewrite", misses: [] }
  }

  const ops: EditOp[] = coerceOps(payload.ops)
  if (ops.length > 0) {
    const applied = applyEdits(args.code, ops)
    if (applied.applied > 0 && applied.failed.length < ops.length) {
      return {
        code: applied.code,
        reply,
        strategy: "ops",
        misses: applied.failed.map(describeFailure),
      }
    }
    // Every op missed. Re-ask, explicitly, for a rewrite.
    return requestRewrite(args, reply, applied.failed.map(describeFailure))
  }

  return requestRewrite(args, reply, [])
}

async function requestRewrite(
  args: Parameters<typeof runEditor>[0],
  priorReply: string,
  misses: string[]
): Promise<EditOutcome> {
  const why =
    misses.length > 0
      ? `Your previous edit did not apply: ${misses.join("; ")}.`
      : "You did not return a usable edit."
  const user = [
    `ORIGINAL BRIEF\n"${args.brief}"`,
    `CHANGE REQUEST\n"${args.note}"`,
    why,
    "Rewrite the ENTIRE file with the change applied. Output ONLY raw JSON:",
    '{reply, code: "<full file as a TypeScript string>"}',
    `CURRENT FILE\n${args.code}`,
  ].join("\n\n")
  try {
    const { result, model: served } = await callGateway<unknown>({
      model: args.model,
      apiKey: args.apiKey,
      // This is the call that actually writes Remotion, so it is the one
      // that pays for the reference. The ops path above does not.
      system: [
        buildKnowledge(args.brief),
        args.canvas
          ? contractsFor(args.canvas)
          : "The existing file's canvas and duration are correct — keep them exactly.",
        // Only on the rewrite path: the editor's whole job is to find and
        // replace three lines, and 25 KB of reference would be paid for
        // nothing on the path that succeeds nine times out of ten.
        fontRules(fontCatalogue()),
        `${EDITOR_SYSTEM}\n\n${EDIT_RULES}`,
      ].join("\n\n"),
      user,
      budget: STEP_BUDGETS.editor,
      opts: {
        stream: args.stream,
        onToken: args.onToken,
        onDelta: args.onDelta,
        images: args.images,
        fallbackModels: args.fallbackModels,
      },
    })
    args.onModel?.(served)
    const p = coercePayload(result)
    const code = typeof p.code === "string" ? p.code.trim() : ""
    if (code.length > 40) {
      return {
        code,
        reply: replyFrom(p.reply ?? priorReply),
        strategy: "rewrite",
        misses,
      }
    }
  } catch {
    /* fall through to failure */
  }
  return { code: args.code, reply: "", strategy: "failed", misses }
}
