import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai"
import { useChat } from "@ai-sdk/react"
import {
  Check,
  Loader2,
  Paperclip,
  RectangleHorizontal,
  RectangleVertical,
  Send,
  Sparkles,
  Square,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatBytes, downscaleDataUrl, type Attachment } from "@/lib/attachments"
import { getAuthToken } from "@/lib/auth"
import { asArtifact, type Artifact } from "@/lib/artifact"
import {
  DEFAULT_DURATION,
  DURATIONS,
  FORMATS,
  specSuffix,
} from "@/lib/motion"

function formatIcon(format: string): LucideIcon {
  if (format.includes("9:16")) return RectangleVertical
  if (format.includes("1:1")) return Square
  return RectangleHorizontal
}
import {
  agentConfigured,
  createAgentConversation,
  listAgentConversations,
  loadAgentMessages,
  seedAgentConversation,
  type AgentConversation,
} from "@/lib/agent"
import {
  getCreditsFresh,
  isOutOfCreditsError,
  useCredits,
  type CreditsSnapshot,
} from "@/lib/credits"
import { navigate } from "@/lib/router"

const API = import.meta.env.VITE_API_URL as string | undefined
const IS_PROD = import.meta.env.PROD

/** Production-safe backend copy — dev commands never leak to users. */
function backendDownCopy(): string {
  return IS_PROD
    ? "Can't reach the AI service — check your connection, then retry."
    : "Can't reach the backend — run `pnpm dev` (or `pnpm -C backend dev`), then retry."
}

/**
 * Human-friendly activity labels. This is a video studio, not a code
 * editor — the user never sees filenames, file ops or pipeline jargon,
 * only honest plain-language states tied to real tool events.
 */
function toolLabel(name: string): string {
  switch (name) {
    case "get_project":
    case "get_project_structure":
      return "Getting oriented"
    case "read_file":
    case "search_code":
      return "Looking at your video"
    case "create_file":
    case "edit_file":
      return "Updating the animation"
    case "write_composition":
      return "Composing the scene"
    case "delete_file":
    case "rename_file":
      return "Tidying up"
    case "inspect_composition":
    case "inspect_timeline":
      return "Reviewing the timeline"
    case "validate_composition":
      return "Checking it plays"
    case "preview_composition":
      return "Preparing your preview"
    case "render_video":
      return "Getting the export ready"
    case "get_errors":
    case "get_logs":
    case "inspect_render_error":
      return "Checking for issues"
    case "search_assets":
    case "inspect_asset":
      return "Checking your media"
    case "import_asset":
      return "Adding your image"
    case "remove_asset":
      return "Tidying up"
    case "ask_user":
      return "A quick question"
    case "request_approval":
      return "Needs your approval"
    default:
      return "Working"
  }
}

interface ToolPart {
  type: string
  toolCallId?: string
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
}

function asToolPart(p: unknown): ToolPart | null {
  if (typeof p !== "object" || p === null) return null
  const t = (p as { type?: unknown }).type
  if (typeof t !== "string" || (!t.startsWith("tool-") && t !== "dynamic-tool")) return null
  return p as ToolPart
}

function toolPartsOf(msg: UIMessage): ToolPart[] {
  const out: ToolPart[] = []
  for (const p of msg.parts) {
    const tp = asToolPart(p)
    if (tp) out.push(tp)
  }
  return out
}

function toolNameOf(p: ToolPart): string {
  if (p.type === "dynamic-tool") {
    return String((p as { toolName?: unknown }).toolName ?? "tool")
  }
  return p.type.slice("tool-".length)
}


function shortResult(name: string, output: unknown): string | null {
  if (typeof output !== "object" || output === null) return null
  const o = output as Record<string, unknown>
  if (name === "validate_composition") {
    if (o.ok === true) return null
    const blocking = Array.isArray(o.blocking) ? o.blocking.length : 0
    return `found ${blocking} thing${blocking === 1 ? "" : "s"} to fix`
  }
  if (name === "preview_composition" && o.ok === true) {
    return typeof o.version === "number" ? `ready · v${o.version}` : "ready"
  }
  if (name === "ask_user" || name === "request_approval") return null
  return null
}

/**
 * Lite markdown for assistant replies: paragraphs with real line breaks,
 * bullets, numbered lists, small headings, bold/italic/code/links.
 * Deliberately compact — headings stay close to body size, code stays
 * inline-friendly. Built from React nodes (never raw HTML), so model
 * output cannot inject markup.
 */
const INLINE_RE =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g

function inlineNodes(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(INLINE_RE)
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key} className="font-semibold">{inlineNodes(part.slice(2, -2), key)}</strong>
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{inlineNodes(part.slice(1, -1), key)}</em>
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return <span key={key} className="line-through opacity-80">{part.slice(2, -2)}</span>
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-px font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      )
    }
    const link = part.match(/^\[([^\]\n]+)\]\(([^)\n]+)\)$/)
    if (link) {
      const href = link[2]!
      const safe = /^(https?:\/\/|mailto:)/i.test(href) ? href : undefined
      return safe ? (
        <a key={key} href={safe} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
          {link[1]}
        </a>
      ) : (
        <span key={key}>{link[1]}</span>
      )
    }
    return <span key={key}>{part}</span>
  })
}

type MdBlock =
  | { type: "h"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; text: string }
  | { type: "quote"; lines: string[] }
  | { type: "p"; lines: string[] }

function mdBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  const lines = text.split("\n")
  let i = 0
  const pushPara = (linesOut: string[]) => {
    if (linesOut.length > 0) blocks.push({ type: "p", lines: linesOut })
  }
  let para: string[] = []
  while (i < lines.length) {
    const line = lines[i]!
    const fence = line.trim().match(/^```(\w*)\s*$/)
    if (fence) {
      pushPara(para)
      para = []
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        buf.push(lines[i]!)
        i++
      }
      i++ // skip closing fence (or EOF)
      blocks.push({ type: "code", text: buf.join("\n") })
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      pushPara(para)
      para = []
      blocks.push({ type: "h", level: h[1]!.length, text: h[2]!.trim() })
      i++
      continue
    }
    const bullet = line.trim().match(/^[•\-*]\s+(.*)$/)
    if (bullet) {
      pushPara(para)
      para = []
      const items = [bullet[1]!]
      i++
      while (i < lines.length) {
        const b = lines[i]!.trim().match(/^[•\-*]\s+(.*)$/)
        if (!b) break
        items.push(b[1]!)
        i++
      }
      blocks.push({ type: "ul", items })
      continue
    }
    const num = line.trim().match(/^\d+[.)]\s+(.*)$/)
    if (num) {
      pushPara(para)
      para = []
      const items = [num[1]!]
      i++
      while (i < lines.length) {
        const b = lines[i]!.trim().match(/^\d+[.)]\s+(.*)$/)
        if (!b) break
        items.push(b[1]!)
        i++
      }
      blocks.push({ type: "ol", items })
      continue
    }
    if (line.trim().startsWith(">")) {
      pushPara(para)
      para = []
      const quotes = [line.trim().replace(/^>\s?/, "")]
      i++
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        quotes.push(lines[i]!.trim().replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ type: "quote", lines: quotes })
      continue
    }
    if (!line.trim()) {
      pushPara(para)
      para = []
      i++
      continue
    }
    para.push(line)
    i++
  }
  pushPara(para)
  return blocks
}

function MdText({ text }: { text: string }) {
  return (
    <span className="block">
      {mdBlocks(text).map((b, i) => {
        if (b.type === "h") {
          return (
            <span
              key={i}
              className={cn(
                "mb-1 mt-2 block font-semibold first:mt-0",
                b.level === 1 ? "text-[15px]" : b.level === 2 ? "text-sm" : "text-[13px]"
              )}
            >
              {inlineNodes(b.text, `h${i}`)}
            </span>
          )
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="my-1 list-disc space-y-0.5 pl-4 marker:text-muted-foreground">
              {b.items.map((l, j) => (
                <li key={j}>{inlineNodes(l, `u${i}-${j}`)}</li>
              ))}
            </ul>
          )
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="my-1 list-decimal space-y-0.5 pl-4 marker:text-muted-foreground">
              {b.items.map((l, j) => (
                <li key={j}>{inlineNodes(l, `o${i}-${j}`)}</li>
              ))}
            </ol>
          )
        }
        if (b.type === "code") {
          return (
            <pre key={i} className="my-1.5 overflow-x-auto rounded-lg border bg-muted/60 p-2 font-mono text-[12px] leading-relaxed">
              <code>{b.text}</code>
            </pre>
          )
        }
        if (b.type === "quote") {
          return (
            <span key={i} className="my-1 block border-l-2 border-primary/40 pl-2 text-muted-foreground">
              {b.lines.map((l, j) => (
                <span key={j} className="block">
                  {inlineNodes(l, `q${i}-${j}`)}
                </span>
              ))}
            </span>
          )
        }
        return (
          <span key={i} className="mb-1 block last:mb-0">
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inlineNodes(l.trim(), `p${i}-${j}`)}
              </span>
            ))}
          </span>
        )
      })}
    </span>
  )
}

/**
 * Seconds since mount, shown only after 5s of silence — fast turns stay
 * clean, slow ones prove they're alive so nobody assumes a hang.
 */
function Elapsed({ className }: { className?: string }) {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const t = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  if (s < 5) return null
  return (
    <span className={cn("tabular-nums", className)} aria-label={`${s} seconds elapsed`}>
      {s}s
    </span>
  )
}
function ActivityLine({ parts }: { parts: ToolPart[] }) {
  const visible = parts.filter((p) => {
    const n = toolNameOf(p)
    return n !== "ask_user" && n !== "request_approval"
  })
  if (visible.length === 0) return null
  const failed = visible.find((p) => (p.state ?? "") === "output-error")
  const active =
    [...visible].reverse().find((p) => {
      const s = p.state ?? ""
      return s !== "output-available" && s !== "output-error"
    }) ?? visible[visible.length - 1]!
  // All done and all ok → collapse to nothing; the reply below says it all.
  if (!failed && (active.state ?? "") === "output-available") {
    const fixes = visible.filter(
      (p) => toolNameOf(p) === "validate_composition" && shortResult(toolNameOf(p), p.output)
    )
    if (fixes.length === 0) return null
  }
  const name = toolNameOf(failed ?? active)
  const isFailed = !!failed
  const isDone = !isFailed && (active.state ?? "") === "output-available"
  const extra = isDone ? shortResult(name, (failed ?? active).output) : null
  // Cutting-room slate: a tinted live card, not a log row.
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px]",
        isFailed
          ? "border-destructive/30 bg-destructive/[0.07]"
          : "border-primary/20 bg-primary/[0.06]"
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          isFailed ? "bg-destructive/15" : isDone ? "bg-emerald-500/15" : "bg-primary/15"
        )}
      >
        {isFailed ? (
          <X className="size-3 text-destructive" />
        ) : isDone ? (
          <Check className="size-3 text-emerald-500" />
        ) : (
          <Loader2 className="size-3 animate-spin text-primary" />
        )}
      </span>
      <span className="truncate font-medium">
        {toolLabel(name)}
        {extra ? <span className="font-normal text-muted-foreground"> — {extra}</span> : null}
        {isFailed && (failed!.errorText ?? "") ? (
          <span className="font-normal text-muted-foreground">
            : {friendlyError(failed!.errorText ?? "")}
          </span>
        ) : null}
        {!isDone && !isFailed ? <span className="tabular-nums">…</span> : null}
      </span>
      {!isDone && !isFailed && (
        <Elapsed className="ml-auto shrink-0 text-[10px] text-muted-foreground" />
      )}
    </div>
  )
}



/**
 * Tool failures in plain words. Technical detail stays in the server log;
 * the chat gets something a non-technical user can act on.
 */
function friendlyError(raw: string): string {
  const s = raw.trim()
  if (!s) return "Something interrupted that — retry and I'll pick it up."
  // Exhausted wallet: the backend 402 message is written for the user
  // (allowance, reset date), so it passes through verbatim instead of
  // being replaced by the generic fallback below.
  if (isOutOfCreditsError(s)) {
    const m = s.match(/You've used all [\s\S]{0,200}?\. /)
    return m ? m[0].trim() : "You've run out of credits — upgrade for more, or wait for the reset."
  }
  // AI SDK's generic tool error when the stream dies mid-turn (e.g. the
  // Worker was killed): never show the raw sentence, it says nothing.
  if (/^an error occurred\.?$/i.test(s)) return "Interrupted mid-step — retry and I'll continue."
  if (/aborted|abort/i.test(s)) return "Stopped — nothing from this run was saved."
  if (/failed to fetch|networkerror|load failed|backend didn't respond|can't reach|couldn't reach/i.test(s))
    return backendDownCopy()
  if (/not found|conversation not found/i.test(s))
    return "That chat is gone — start a new one below."
  if (/unauthorized|401|forbidden|403/i.test(s))
    return "Your session expired — sign in again, then retry."
  if (/ai isn't set up|503/i.test(s))
    return "The AI service is warming up — wait a moment, then retry."
  if (/blocking errors remain|Cannot preview/i.test(s)) return "needs a fix first — working on it"
  if (/not found/i.test(s)) return "couldn't find that — checking again"
  if (/confirmation required/i.test(s)) return "needs your confirmation"
  if (s.length <= 120) return s
  return "Something went wrong — retry and I'll pick it up."
}

function AskBlock({
  output,
  disabled,
  answered,
  onAnswer,
}: {
  output: unknown
  disabled: boolean
  answered?: boolean
  onAnswer: (text: string) => void
}) {
  const o = (output ?? {}) as { question?: unknown; options?: unknown; action?: unknown }
  const question =
    typeof o.question === "string" ? o.question : typeof o.action === "string" ? o.action : null
  const options = Array.isArray(o.options)
    ? o.options.filter((x): x is string => typeof x === "string").slice(0, 4)
    : []
  if (!question) return null
  // Director's slate: theme-aware mini-card that ties the chat to the
  // screening room next to it. Tapping an option sends it instantly.
  return (
    <div className="mt-1.5 flex flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-lg dark:border-white/10 dark:bg-neutral-950 dark:text-white">
      <div aria-hidden className="pointer-events-none -mx-3 -mt-3 h-8 bg-grid opacity-40 dark:bg-grid-dark dark:opacity-60" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-white/50">
        SlyxUp asks
      </p>
      <p className="-mt-1 text-[13px] font-medium leading-snug">{question}</p>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onAnswer(opt)}
              className="max-w-full cursor-pointer rounded-full border border-input bg-secondary px-3 py-1.5 text-left text-[12px] font-medium break-words transition-colors hover:border-primary/50 disabled:cursor-default disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.07] dark:text-white/90 dark:hover:border-white/30 dark:hover:bg-white/[0.14]"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      <p className="-mb-0.5 text-[10px] text-muted-foreground dark:text-white/40">
        {answered ? "Answered — continue below" : "Tap an option to send it instantly"}
      </p>
    </div>
  )
}

/**
 * Continuation token. One server request = ONE model step (CPU-capped
 * plans die on multi-step loops), so the client chains steps by sending
 * this exact text. It is NEVER rendered (filtered from the transcript
 * below), never persisted server-side, and never charged. Shared
 * contract with backend routes/agent.ts — same literal both sides.
 */
const CONTINUE_TOKEN = "[continue-turn]"
const MAX_STEPS_PER_TURN = 7

function messageText(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text?: string }).text ?? "")
    .join("")
}

/** Continuation markers are transport, not conversation — hide them. */
function isContinueMessage(m: UIMessage): boolean {
  return m.role === "user" && messageText(m).trim() === CONTINUE_TOKEN
}

/** Assistant step-messages since the last real user message. */
function stepsUsedIn(messages: UIMessage[]): number {
  let n = 0
  for (const m of messages) {
    if (m.role === "user") {
      if (!isContinueMessage(m)) n = 0
      continue
    }
    if (m.role === "assistant" && toolPartsOf(m).length > 0) n += 1
  }
  return n
}

/**
 * The composer appends "(Duration: 5 seconds. Format: 16:9.)" for the
 * model — it rides along invisibly, stripped here for display so the
 * bubble shows only what the user actually typed.
 */
const SPEC_SUFFIX_RE = /\s*\(Duration:\s*\d+\s*seconds?\.\s*Format:\s*[^)]+\)\.?\s*$/i

function displayUserText(text: string): string {
  return text.replace(SPEC_SUFFIX_RE, "").trim()
}

function assistantText(msg: UIMessage): string {  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text?: string }).text ?? "")
    .join("")
    .trim()
}

/**
 * Streaming "thinking" parts (AI SDK `reasoning`). The old renderer only
 * read `text`, so a model that thinks before it writes showed a blank
 * bubble — sometimes "Thinking…", sometimes nothing, depending on timing.
 */
function reasoningText(msg: UIMessage): string {
  return msg.parts
    .filter((p) => p.type === "reasoning")
    .map((p) => (p as { text?: string }).text ?? "")
    .join("")
    .trim()
}

/** Collapsible thought trace — open while streaming, closed when done. */
function ReasoningBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const short = text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text
  return (
    <details
      open={streaming}
      className="rounded-xl border border-border/60 bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground"
    >
      <summary className="cursor-pointer select-none font-medium">
        {streaming ? "Thinking…" : "Thought process"}
      </summary>
      <p className="mt-1 whitespace-pre-wrap break-words">{streaming ? text : short}</p>
      {!streaming && text.length > 220 && (
        <p className="mt-1 whitespace-pre-wrap break-words">{text.slice(220)}</p>
      )}
    </details>
  )
}

/**
 * One assistant turn. Never renders an empty bubble: when the model has
 * produced no text, no reasoning and no tool activity yet (the first
 * second of a stream), a Thinking placeholder holds the place instead of
 * a blank "SlyxUp" header. A settled tool-only turn that published a
 * version falls back to a one-line summary (publishedVersion); anything
 * else collapses to just its question cards.
 */
/**
 * Latest published version inside a turn's tool results, if any.
 */
function publishedVersion(tools: ToolPart[]): number | null {
  let v: number | null = null
  for (const p of tools) {
    const n = toolNameOf(p)
    if ((n === "preview_composition" || n === "render_video") && p.state === "output-available") {
      const out = p.output as { version?: unknown } | null
      if (out && typeof out.version === "number") v = out.version
    }
  }
  return v
}

function AssistantBubble({
  message: m,
  firstOfGroup,
  streaming,
  actionsOpen,
  onAnswer,
  isLast,
}: {
  message: UIMessage
  firstOfGroup: boolean
  streaming: boolean
  /**
   * Whether this turn's question cards are still answerable: only the
   * latest assistant turn. Older cards render answered/disabled so a tap
   * can't re-send an already-handled question into a new turn (the
   * "accept shows again for a bit" ghost).
   */
  actionsOpen: boolean
  onAnswer: (text: string) => void
  /**
   * Only the LAST assistant message may summarize. Intermediate step
   * messages (one per server request now) render their live activity at
   * most — never fallback lectures, or every step would narrate.
   */
  isLast: boolean
}) {
  const text = assistantText(m)
  const reasoning = reasoningText(m)
  const tools = toolPartsOf(m)
  const asks = tools.filter((p) => {
    const n = toolNameOf(p)
    return (n === "ask_user" || n === "request_approval") && p.state === "output-available"
  })
  const hasVisible = text.length > 0 || reasoning.length > 0 || tools.length > 0 || asks.length > 0
  // Settled turn, tools ran, model wrote no words: never leave a bare
  // header — the version rail already moved, so say so in one line.
  const published = !streaming && !text && isLast ? publishedVersion(tools) : null
  // Settled, tools ran, but no words and no preview came out (aborted
  // mid-run, validation blocked, or a tool-only turn): the old code
  // rendered a bare "SlyxUp" header or nothing at all — the "2 messages
  // but nothing showing" ghost. Say so honestly instead. Last message
  // only — intermediate steps stay quiet.
  const settledSilent =
    isLast && !streaming && !text && published == null && asks.length === 0 && tools.length > 0
  if (!hasVisible) {
    if (!streaming) {
      if (!isLast) return null
      return (
        <div className="msg-in flex min-w-0 max-w-full flex-col gap-1">
          {firstOfGroup && (
            <span className="flex items-center gap-1.5">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-3" />
              </span>
              <span className="text-[11px] font-semibold tracking-[-0.01em]">SlyxUp</span>
            </span>
          )}
          <div className="break-words text-sm leading-relaxed text-muted-foreground">
            That step finished without a visible reply — press Retry or describe what to do
            next and I&apos;ll pick it up.
          </div>
        </div>
      )
    }
    return (
      <div className="msg-in flex min-w-0 max-w-full flex-col gap-1" aria-live="polite">
        {firstOfGroup && (
          <span className="flex items-center gap-1.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-3" />
            </span>
            <span className="text-[11px] font-semibold tracking-[-0.01em]">SlyxUp</span>
          </span>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
          <Loader2 className="size-3 animate-spin text-primary" />
          Thinking…
          <Elapsed className="ml-auto text-[10px]" />
        </div>
      </div>
    )
  }
  return (
    <div
      className={cn(
        "msg-in flex min-w-0 max-w-full flex-col gap-1.5",
        !firstOfGroup && "-mt-1.5"
      )}
    >
      {firstOfGroup && (
        <span className="flex items-center gap-1.5">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="size-3" />
          </span>
          <span className="text-[11px] font-semibold tracking-[-0.01em]">SlyxUp</span>
        </span>
      )}
      {text && (
        <div className="break-words text-sm leading-relaxed">
          <MdText text={text} />
          {streaming && (
            <span aria-hidden className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse rounded-[2px] bg-primary/70 align-[-2px]" />
          )}
        </div>
      )}
      {published != null && (
        <div className="break-words text-sm leading-relaxed">
          Saved as v{published} — it&apos;s on stage now. Tell me what to change next.
        </div>
      )}
      {settledSilent && published == null && (
        <div className="break-words text-sm leading-relaxed text-muted-foreground">
          That step finished but produced no preview — press Retry or describe what to do
          next and I&apos;ll pick it up.
        </div>
      )}
      {reasoning && <ReasoningBlock text={reasoning} streaming={streaming} />}
      <ActivityLine parts={tools} />
      {asks.map((p, i) => (
        <AskBlock
          key={p.toolCallId ?? i}
          output={p.output}
          disabled={!actionsOpen}
          answered={!actionsOpen}
          onAnswer={onAnswer}
        />
      ))}
    </div>
  )
}

function AgentThread({
  serverProjectId,
  conversationId,
  initialMessages,
  initialPrompt,
  onPromptSent,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  onArtifact,
  onPendingChange,
  stopRef,
  refreshCredits,
}: {
  serverProjectId: string
  conversationId: string
  initialMessages: UIMessage[]
  /** Sent once on mount (new conversation started from the composer). */
  initialPrompt: string | null
  onPromptSent: () => void
  attachments: Attachment[]
  onAttachFiles?: (files: FileList) => void
  onRemoveAttachment?: (id: string) => void
  onArtifact: (artifact: Artifact, reply: string, serverVersion?: number) => void
  onPendingChange?: (pending: boolean) => void
  stopRef?: { current: (() => void) | null }
  /** Wallet refresh (single instance per card) for post-turn updates. */
  refreshCredits?: () => void
}) {
  const [input, setInput] = useState(() => {
    try {
      return localStorage.getItem(`motion:chat-draft:${conversationId}`) ?? ""
    } catch {
      return ""
    }
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const seenArtifacts = useRef(new Set<string>())

  // Persist unsent drafts per conversation; restore on reload.
  useEffect(() => {
    try {
      if (input.trim()) localStorage.setItem(`motion:chat-draft:${conversationId}`, input)
      else localStorage.removeItem(`motion:chat-draft:${conversationId}`)
    } catch {
      /* storage unavailable */
    }
  }, [input, conversationId])

  // Warn before leaving with an unsent draft.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (input.trim()) {
        e.preventDefault()
      }
    }
    window.addEventListener("beforeunload", onBefore)
    return () => window.removeEventListener("beforeunload", onBefore)
  }, [input])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const autosize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])
  useEffect(autosize, [input, autosize])

  /**
   * Memoized transport: the old code rebuilt `DefaultChatTransport` on
   * every render (capturing a stale auth token), so an expired session
   * failed every later send with a generic fetch error. The per-request
   * hook below re-reads the token fresh on each send.
   */
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API}/api/agent/chat`,
        body: { projectId: serverProjectId, conversationId },
        prepareSendMessagesRequest: ({ body, messages, trigger, messageId }) => {
          const headers: Record<string, string> = {}
          const token = getAuthToken()
          if (token) headers.Authorization = `Bearer ${token}`
          // NOTE: the returned body is sent AS-IS — the SDK does not merge
          // messages/trigger back in. Dropping them 400s the chat route
          // (Zod: messages required). Always forward them.
          //
          // The server rebuilds full history from D1 (dedupe by id), so any
          // message it has already stored is re-sending bytes for nothing.
          // That matters most for images: base64 data URLs are ~700KB each,
          // and JSON.parse on them is the single largest CPU item in the
          // request — enough on its own to blow a CPU-capped plan's budget
          // and get the invocation killed mid-stream (the 499s).
          //
          // So: keep file payloads ONLY on the newest message (the one the
          // server has not stored yet). Older turns are already in D1 with
          // their images intact, and the server ignores the stripped copies
          // it dedupes away. Result is identical context, a fraction of the
          // bytes, and no UX change.
          const all = Array.isArray(messages) ? messages : [messages]
          const tail = all.slice(-3).map((m, i, arr) => {
            if (i === arr.length - 1) return m
            if (!Array.isArray(m?.parts)) return m
            const hasFile = m.parts.some((p) => (p as { type?: string })?.type === "file")
            if (!hasFile) return m
            return {
              ...m,
              parts: m.parts.map((p) => {
                const part = p as { type?: string; url?: string }
                if (part?.type !== "file" || typeof part.url !== "string") return p
                // Keep the shape, drop the bytes. The server has the real
                // part in D1 and never reads this field for stored turns.
                return { ...part, url: "" }
              }),
            }
          })
          return {
            body: {
              projectId: serverProjectId,
              conversationId,
              ...(body ?? {}),
              messages: tail,
              trigger,
              messageId,
            },
            headers,
          }
        },
      }),
    [serverProjectId, conversationId]
  )

  const chat = useChat({
    messages: initialMessages,
    transport,
    onError: (e) => console.error(JSON.stringify({ msg: "agent-chat-error", err: String(e) })),
  })

  const pending = chat.status === "submitted" || chat.status === "streaming"

  useEffect(() => {
    onPendingChange?.(pending)
  }, [pending, onPendingChange])

  // The turn spent a credit when it started — refresh the wallet when it
  // settles so pills and guards never show a stale balance.
  const settledRef = useRef(false)
  useEffect(() => {
    if (pending) {
      settledRef.current = false
      return
    }
    if (!settledRef.current) {
      settledRef.current = true
      refreshCredits?.()
    }
  }, [pending, refreshCredits])

  /**
   * Pre-send credit guard. The backend enforces with 402 regardless, but
   * blocking here saves the user a failed round-trip and renders the
   * upgrade path inline. Fresh (not cached) so a just-completed checkout
   * unblocks immediately.
   */
  const [outOfCredits, setOutOfCredits] = useState<CreditsSnapshot | null>(null)
  const checkCredits = useCallback(async (): Promise<boolean> => {
    try {
      const snap = await getCreditsFresh()
      const cost = snap.costs.agentTurn ?? 1
      if (!snap.credits.unlimited && snap.credits.balance < cost) {
        setOutOfCredits(snap)
        return false
      }
      setOutOfCredits(null)
      return true
    } catch {
      // Credits unreachable — let the send through; the backend is the
      // real gate and fails open here would strand the user otherwise.
      setOutOfCredits(null)
      return true
    }
  }, [])

  /**
   * `pending` reads `chat.status`, which only updates a tick after
   * `sendMessage`, so a second Enter or a fast double-click on a starter
   * slipped through the state guard and sent twice. This flips
   * synchronously instead, and releases when the turn settles.
   */
  const inFlight = useRef(false)
  useEffect(() => {
    if (!pending) inFlight.current = false
  }, [pending])

  // Explicit user stop — never auto-continue after this.
  const stoppedRef = useRef(false)
  const stop = useCallback(() => {
    stoppedRef.current = true
    try {
      chat.stop()
    } catch {
      /* already settled */
    }
  }, [chat])

  // Expose the real stop to the preview header (its Stop button must halt
  // the agent stream, not just clear progress UI).
  useEffect(() => {
    if (!stopRef) return
    stopRef.current = stop
    return () => {
      stopRef.current = null
    }
  }, [stopRef, stop, conversationId])

  // Visible transcript: continuation tokens are transport, never rendered.
  const visibleMessages = useMemo(
    () => chat.messages.filter((m) => !isContinueMessage(m)),
    [chat.messages]
  )

  /** This turn still has an open loop (set on every user send, cleared on settle). */
  const turnActiveRef = useRef(false)

  /**
   * Chain the next single step of the open turn. The server runs exactly
   * one model step per request; this hidden token asks for the next one
   * without touching history (never persisted), credits (never charged)
   * or the visible transcript (never rendered). Crucially it is NOT
   * chat.regenerate(): regenerate deletes the last assistant message
   * client-side, which would hide every previous step's text and tools.
   */
  const sendContinue = useCallback(async (): Promise<boolean> => {
    if (
      chat.status === "submitted" ||
      chat.status === "streaming" ||
      inFlight.current ||
      stoppedRef.current
    ) {
      return false
    }
    inFlight.current = true
    try {
      await chat.sendMessage({ text: CONTINUE_TOKEN })
      return true
    } catch {
      inFlight.current = false
      return false
    }
  }, [chat])

  /** Fatal errors a free continuation must never bypass (wallet/auth/gone). */
  const isFatalError = useCallback((msg: string): boolean => {
    return (
      isOutOfCreditsError(msg) ||
      /401|403|404|unauthorized|forbidden|session expired|sign in|gone|not found/i.test(msg)
    )
  }, [])

  /**
   * Turn-loop driver. Fires when a step stream settles:
   * - user stopped → done, forever.
   * - fatal error → done (the error card + upgrade path own it now).
   * - transient error (incl. a CPU-killed request) → one silent token
   *   retry per error: tool effects are durable in D1 and the lint cache
   *   makes the redo cheap, so a killed step resumes instead of dying.
   * - step ended with tool calls the model hasn't reacted to, no
   *   ask/approval pending, under the step cap → chain the next step.
   * - otherwise (text-only close, question asked, cap reached) → done.
   */
  const autoRetried = useRef<string | null>(null)
  const [autoRetrying, setAutoRetrying] = useState(false)
  useEffect(() => {
    if (pending) {
      stoppedRef.current = false
      setAutoRetrying(false)
      return
    }
    if (!turnActiveRef.current || stoppedRef.current) return
    const err = chat.error
    if (err) {
      const key = err.message
      if (autoRetried.current === key || isFatalError(key)) {
        turnActiveRef.current = false
        return
      }
      autoRetried.current = key
      setAutoRetrying(true)
      const t = setTimeout(() => {
        setAutoRetrying(false)
        if (!turnActiveRef.current || stoppedRef.current) return
        void sendContinue().then((ok) => {
          if (!ok) turnActiveRef.current = false
        })
      }, 1500)
      return () => clearTimeout(t)
    }
    const visible = chat.messages.filter((m) => !isContinueMessage(m))
    const last = visible.length > 0 ? visible[visible.length - 1]! : null
    const lastTools = last && last.role === "assistant" ? toolPartsOf(last) : []
    const asked = lastTools.some((p) => {
      const n = toolNameOf(p)
      return n === "ask_user" || n === "request_approval"
    })
    const steps = stepsUsedIn(visible)
    const zeroTrace =
      !last ||
      (last.role === "user" &&
        !visible.some(
          (m) =>
            m.role === "assistant" &&
            m.parts.some((p) =>
              p.type === "text" || p.type === "reasoning"
                ? Boolean((p as { text?: string }).text?.trim())
                : (p as { type?: string }).type?.startsWith("tool-") ||
                  (p as { type?: string }).type === "dynamic-tool"
            )
        ))
    if ((lastTools.length > 0 && !asked && steps < MAX_STEPS_PER_TURN) || zeroTrace) {
      // Turn stays open; the chained step releases inFlight on settle.
      void sendContinue().then((ok) => {
        if (!ok) turnActiveRef.current = false
      })
      return
    }
    turnActiveRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  // New conversation (or remount) resets the loop state.
  useEffect(() => {
    turnActiveRef.current = false
    autoRetried.current = null
    stoppedRef.current = false
    setAutoRetrying(false)
  }, [conversationId])

  /**
   * Stall watchdog: gateway steps can take 11–26s each and a full turn
   * several minutes. If nothing arrives for 60s the run is probably
   * queued, not dead — say so explicitly instead of spinning forever
   * like the 152s "Composing…" hang. Anything already saved stays saved;
   * Stop + Retry resumes from the last version.
   */
  const [stalled, setStalled] = useState(false)
  const lastActivity = useRef(Date.now())
  useEffect(() => {
    lastActivity.current = Date.now()
    setStalled(false)
  }, [chat.messages, chat.status])
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current > 60_000) setStalled(true)
    }, 5000)
    return () => clearInterval(t)
  }, [pending])

  /**
   * Tools the server has reported starting, for the live progress chips.
   *
   * The backend runs the model NON-streaming (it cannot afford to parse
   * every SSE token on a CPU-capped plan), so there is no token stream to
   * animate. Instead it emits a transient `data-toolstart` event as each
   * tool actually executes. This is that signal — real events, in real
   * order, so the progress shown is never invented.
   */
  const [liveTools, setLiveTools] = useState<string[]>([])
  useEffect(() => {
    if (!pending) {
      setLiveTools([])
      return
    }
    const seen: string[] = []
    for (const part of chat.messages) {
      for (const p of part.parts) {
        const d = p as { type?: string; data?: { tool?: unknown } }
        if (d?.type === "data-toolstart" && typeof d.data?.tool === "string") {
          if (!seen.includes(d.data.tool)) seen.push(d.data.tool)
        }
      }
    }
    setLiveTools(seen)
  }, [chat.messages, pending])

  /**
   * Reference images, downscaled BEFORE send. The old code attached the
   * original data URLs (up to 2.5 MB → ~3.3 MB base64 each): they were
   * persisted to D1, re-sent every turn and re-serialized on every model
   * step — a major share of the Worker's CPU budget and the reason long
   * chats got slower and then died.
   */
  const filesFor = useCallback(async (): Promise<FileUIPart[]> => {
    const out: FileUIPart[] = []
    for (const a of attachments
      .filter((x) => x.dataUrl.startsWith("data:image/"))
      .slice(0, 3)) {
      try {
        const url = await downscaleDataUrl(a.dataUrl)
        out.push({ type: "file" as const, mediaType: "image/jpeg", url })
      } catch {
        /* skip unreadable attachments */
      }
    }
    return out
  }, [attachments])

  // Opening prompt held locally when the credit guard blocks the
  // auto-send: the handoff text must survive until the user upgrades,
  // then go out via the card's "check again" action below.
  const [pendingInitial, setPendingInitial] = useState<string | null>(null)
  const autoSent = useRef(false)

  const sendInitial = useCallback(
    async (text: string) => {
      if (!(await checkCredits())) {
        // Keep the text: clearing the parent prompt now would drop the
        // user's brief with nowhere to recover it from.
        setPendingInitial(text)
        autoSent.current = false
        onPromptSent()
        return
      }
      setPendingInitial(null)
      turnActiveRef.current = true
      autoRetried.current = null
      const files = await filesFor()
      await chat.sendMessage(files.length > 0 ? { text, files } : { text })
    },
    [checkCredits, filesFor, chat, onPromptSent]
  )

  /** Retry after upgrade: re-check, then send any held opening prompt. */
  const retryBlockedInitial = useCallback(async () => {
    if (!pendingInitial) {
      await checkCredits()
      return
    }
    if (pending) return
    inFlight.current = true
    try {
      await sendInitial(pendingInitial)
    } catch {
      /* prompt stays held for another try */
    } finally {
      inFlight.current = false
    }
  }, [pendingInitial, pending, sendInitial, checkCredits])

  // Auto-send the composer's opening prompt exactly once.
  useEffect(() => {
    if (autoSent.current) return
    if (!initialPrompt || chat.messages.length > 0 || chat.status !== "ready") return
    // Set the ref *before* sending. `onPromptSent` clears the prop in the
    // parent, but that state update is not committed until later, so under
    // StrictMode's double-invoked effect the prop is still the old prompt
    // on the second pass and used to send it a second time.
    autoSent.current = true
    void (async () => {
      try {
        await sendInitial(initialPrompt)
      } catch {
        autoSent.current = false
      }
    })()
    if (!pendingInitial) onPromptSent()
  }, [initialPrompt, chat.messages.length, chat.status, chat, onPromptSent, filesFor, sendInitial, pendingInitial])

  // Stick-to-bottom, coalesced on animation frames: during fast
  // streaming this effect fires per chunk, and a synchronous
  // scrollHeight read each time forces layout mid-stream (jank).
  const stickRaf = useRef(0)
  useEffect(() => {
    // Follows the stream chunk-by-chunk (messages identity changes per
    // chunk), not just per message — otherwise a long reply streams
    // below the fold while the user stares at stale content up top.
    if (!stickRef.current) return
    cancelAnimationFrame(stickRaf.current)
    stickRaf.current = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el && stickRef.current) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(stickRaf.current)
  }, [chat.messages, pending])

  // Bridge published previews into the local version rail + player.
  // The server version number rides along so the studio can tell a real
  // new cut from a re-preview of identical code (no version inflation).
  useEffect(() => {
    for (const m of chat.messages) {
      if (m.role !== "assistant") continue
      for (const tp of toolPartsOf(m)) {
        if (!tp.toolCallId) continue
        if (seenArtifacts.current.has(tp.toolCallId)) continue
        const name = toolNameOf(tp)
        if (name !== "preview_composition" && name !== "render_video") continue
        if (tp.state !== "output-available") continue
        const out = (tp.output ?? {}) as { artifact?: unknown; version?: unknown }
        const art = asArtifact(out.artifact)
        if (art) {
          seenArtifacts.current.add(tp.toolCallId)
          onArtifact(
            art,
            assistantText(m),
            typeof out.version === "number" ? out.version : undefined
          )
        }
      }
    }
  }, [chat.messages, onArtifact])

  const send = (text?: string) => {
    const value = (text ?? input).trim()
    if (!value || pending || inFlight.current) return
    if (outOfCredits) return
    inFlight.current = true
    // Fresh user turn gets its own loop + retry budget.
    turnActiveRef.current = true
    autoRetried.current = null
    setInput("")
    try {
      localStorage.removeItem(`motion:chat-draft:${conversationId}`)
    } catch {
      /* storage unavailable */
    }
    void (async () => {
      try {
        if (!(await checkCredits())) {
          inFlight.current = false
          return
        }
        const files = await filesFor()
        await chat.sendMessage(
          files.length > 0 ? { text: value, files } : { text: value }
        )
      } catch {
        inFlight.current = false
      }
    })()
  }

  /**
   * Manual Retry: resume a died step via token (preserves its partial
   * message), or classically redo a completed answer the user dislikes.
   */
  const manualRetry = useCallback(() => {
    const visible = chat.messages.filter((m) => !isContinueMessage(m))
    const last = visible.length > 0 ? visible[visible.length - 1]! : null
    turnActiveRef.current = true
    autoRetried.current = null
    stoppedRef.current = false
    if (last && last.role === "assistant" && toolPartsOf(last).length > 0) {
      void sendContinue()
    } else {
      try {
        void chat.regenerate()
      } catch {
        /* composer stays available */
      }
    }
  }, [chat, sendContinue])

  const starters = ["Neon countdown intro", "Lower third for interviews", "Earnings chart reveal"]

  return (
    <>
      <style>{`@keyframes msg-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.msg-in{animation:msg-in .25s ease-out}
@media (prefers-reduced-motion: reduce){.msg-in{animation:none}}`}</style>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-label="Messages"
        aria-live="off"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-chat px-3 py-2.5 text-left"
      >
        {visibleMessages.length === 0 && !pending && !initialPrompt && !pendingInitial && (
          <div className="msg-in flex flex-col items-center gap-1 rounded-2xl border border-dashed px-5 py-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <p className="mt-1 text-sm font-semibold">Describe the clip or the change</p>
            <p className="max-w-xs text-[13px] text-muted-foreground">
              I inspect the project first, then edit, validate and preview — each change saves as a
              new version.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-px hover:border-primary/60 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {visibleMessages.map((m, idx) => {
          const firstOfGroup = idx === 0 || visibleMessages[idx - 1]?.role !== m.role
          const isLast = idx === visibleMessages.length - 1
          const streamingThis = pending && isLast
          return m.role === "user" ? (
            <div
              key={m.id}
              className="msg-in max-w-[85%] self-end break-words rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
            >
              {/* Only the newest turn carries its image bytes; older turns
                  were sent (and stored) without them to keep the request
                  payload small. Rendering an empty src would show a broken
                  image icon, so those turns fall back to a count badge —
                  the reference is still visible in the conversation. */}
              {(() => {
                const files = m.parts.filter((p) => p.type === "file") as Array<{ url?: string }>
                if (files.length === 0) return null
                const withBytes = files.filter((f) => typeof f.url === "string" && f.url.startsWith("data:"))
                if (withBytes.length === 0) {
                  return (
                    <span className="mb-1.5 inline-flex items-center gap-1 rounded-lg bg-white/15 px-1.5 py-0.5 text-[11px] font-medium">
                      {files.length === 1 ? "1 reference image" : `${files.length} reference images`}
                    </span>
                  )
                }
                return (
                  <span className="mb-1.5 flex gap-1.5">
                    {withBytes.slice(0, 3).map((f, i) => (
                      <img
                        key={i}
                        src={f.url}
                        alt="Reference"
                        className="size-14 rounded-lg border border-white/20 object-cover"
                      />
                    ))}
                  </span>
                )
              })()}
              {m.parts
                .filter((p) => p.type === "text")
                .map((p, i, arr) => (
                  <span key={i}>
                    {displayUserText((p as { text?: string }).text ?? "")}
                    {i < arr.length - 1 ? "\n" : ""}
                  </span>
                ))}
            </div>
          ) : (
            <AssistantBubble
              key={m.id}
              message={m}
              firstOfGroup={firstOfGroup}
              streaming={streamingThis}
              actionsOpen={isLast && !pending}
              onAnswer={send}
              isLast={isLast}
            />
          )
        })}
        {pending &&
          (visibleMessages.length === 0 ||
            visibleMessages[visibleMessages.length - 1]?.role !== "assistant") && (
            <div
              className="msg-in flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="size-3 animate-spin text-primary" />
              {/* Real progress, from real tool events the server emits while
                  the model works. The server no longer streams tokens (it
                  can't afford the CPU), so this card is the honest signal
                  that work is happening — and which step it reached. */}
              {liveTools.length > 0
                ? liveTools.map((t, i) => (
                    <span
                      key={`${t}-${i}`}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-foreground/80"
                    >
                      <Check className="size-2.5 text-primary" aria-hidden />
                      {toolLabel(t)}
                    </span>
                  ))
                : "Thinking…"}
              <Elapsed className="ml-auto text-[10px]" />
            </div>
          )}
        {pending && stalled && (
          <div
            className="msg-in flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
            role="status"
            aria-live="polite"
          >
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            <span>
              Taking longer than usual — still working. Anything already saved stays
              saved; you can Stop and retry, and I&apos;ll pick it up.
            </span>
          </div>
        )}
        {outOfCredits && (
          <div className="msg-in flex flex-col gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] shadow-lg" role="alert">
            <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
              <TriangleAlert className="size-3.5" aria-hidden />
              Out of credits
            </span>
            <span className="text-muted-foreground">
              You&apos;ve used all {outOfCredits.credits.allowance} credits on the{" "}
              {outOfCredits.credits.tierLabel} plan
              {outOfCredits.credits.resetsAt
                ? ` — they reset ${new Date(outOfCredits.credits.resetsAt).toLocaleDateString()}`
                : ""}
              . Upgrade for more, or wait for the reset.
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-9 min-h-[44px] px-4 text-[12px]" onClick={() => navigate("/settings#subscription")}>
                View plans
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 min-h-[44px] px-4 text-[12px]"
                onClick={() => void retryBlockedInitial()}
              >
                I&apos;ve upgraded — check again
              </Button>
            </div>
          </div>
        )}
        {chat.error && (
          <div className="msg-in flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-[12px] shadow-lg" role="alert">
            <span className="flex items-center gap-1.5 font-medium text-destructive">
              <TriangleAlert className="size-3.5" aria-hidden />
              Something went wrong
            </span>
            <span className="text-muted-foreground">{friendlyError(chat.error.message)}</span>
            {autoRetrying && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
                <Loader2 className="size-3 animate-spin text-primary" aria-hidden />
                That turn produced nothing — retrying automatically…
              </span>
            )}
            <details className="text-[11px] text-muted-foreground/70">
              <summary className="cursor-pointer hover:text-muted-foreground">Technical details</summary>
              <span className="break-words">{chat.error.message}</span>
            </details>
            <div className="flex flex-wrap gap-2">
              {isOutOfCreditsError(chat.error.message) ? (
                <>
                  <Button size="sm" className="h-9 min-h-[44px] px-4 text-[12px]" onClick={() => navigate("/settings#subscription")}>
                    View plans
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 min-h-[44px] px-4 text-[12px]"
                    onClick={() => {
                      refreshCredits?.()
                      try {
                        void chat.regenerate()
                      } catch {
                        /* manual send stays available */
                      }
                    }}
                  >
                    I&apos;ve upgraded — retry
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" className="h-9 min-h-[44px] px-4 text-[12px]" onClick={manualRetry}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-2.5 pb-2.5">
        <div className="rounded-2xl border bg-card transition-colors focus-within:border-primary/50">
          {attachments.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5">
              {attachments.map((a) => (
                <span key={a.id} className="relative shrink-0">
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    title={`${a.name} · ${formatBytes(a.size)}`}
                    className="size-12 rounded-xl border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment?.(a.id)}
                    aria-label={`Remove ${a.name}`}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <label htmlFor={`chat-input-${conversationId}`} className="sr-only">
            Describe the change to your clip
          </label>
          <textarea
            ref={inputRef}
            id={`chat-input-${conversationId}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                // Enter mid-run must NOT queue behind the run — only Stop interrupts.
                if (!pending) send()
              }
            }}
            rows={1}
            placeholder="Describe the change…"
            aria-label="Describe the change to your clip"
            aria-describedby={pending ? `chat-working-${conversationId}` : undefined}
            className="max-h-[120px] w-full min-w-0 resize-none bg-transparent px-3 pb-1 pt-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          {pending && (
            <p id={`chat-working-${conversationId}`} className="sr-only" aria-live="polite">
              Working on your clip. Press Stop to interrupt.
            </p>
          )}
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Attach reference image"
              title="Attach reference image"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-3.5" aria-hidden />
            </Button>
            <div className="flex-1" />
            <Button
              size="icon"
              aria-label={pending ? "Stop generation" : "Send message"}
              title={pending ? "Stop generation" : "Send message (Enter)"}
              disabled={pending ? false : !input.trim()}
              onClick={pending ? stop : () => send()}
              className={cn(
                "size-10 min-h-[44px] min-w-[44px] shrink-0 cursor-pointer rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-50",
                pending && "bg-destructive hover:bg-destructive/90"
              )}
            >
              {pending ? <Square className="size-3.5" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
            </Button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files?.length) onAttachFiles?.(e.target.files)
            e.target.value = ""
          }}
        />
      </div>
    </>
  )
}

/**
 * Boot feedback is additive, never a takeover.
 *
 * The chat used to be replaced wholesale while the project was prepared,
 * so a slow backend cost the user the composer, the send button and every
 * action in the panel. These sit above the real UI instead: the composer
 * stays mounted, and only the parts that genuinely have nothing to show
 * yet render a placeholder.
 */
function StatusStrip({ label }: { label: string }) {
  return (
    <div
      className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-2.5 py-2"
      role="status"
      aria-live="polite"
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <Loader2 className="size-3 animate-spin text-primary" />
      </span>
      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{label}</span>
    </div>
  )
}

function WarnStrip({ label }: { label: string }) {
  return (
    <div
      className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-2"
      role="status"
      aria-live="polite"
    >
      <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">{label}</span>
    </div>
  )
}

/** Placeholder history for a chat that exists but hasn't loaded yet. */
function ConversationSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 px-4 py-4" aria-hidden>
      <div className="flex items-center gap-1.5">
        <div className="size-5 rounded-full bg-muted" />
        <div className="h-2.5 w-16 rounded-full bg-muted" />
      </div>
      <div className="h-3 w-3/4 rounded-md bg-muted" />
      <div className="h-3 w-1/2 rounded-md bg-muted" />
      <div className="h-16 w-full rounded-2xl border border-border/50 bg-muted/40" />
      <div className="h-8 w-2/5 self-end rounded-2xl rounded-tr-md bg-primary/20" />
    </div>
  )
}

/** Fold a freshly fetched list in behind chats the user just created. */
function mergeById(a: AgentConversation[], b: AgentConversation[]): AgentConversation[] {
  const seen = new Set(a.map((c) => c.id))
  return [...a, ...b.filter((c) => !seen.has(c.id))]
}

export function AgentChatCard({
  serverProjectId,
  onEnsureServerProject,
  onArtifact,
  legacyThread,
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
  footer,
  firstPrompt = null,
  defaultFormat = null,
  defaultSecs = null,
  onWorkingChange,
  stopRef,
}: {
  serverProjectId: string | null
  onEnsureServerProject: () => Promise<string | null>
  onArtifact: (artifact: Artifact, reply: string, serverVersion?: number) => void
  legacyThread: Array<{ role: string; text: string }>
  attachments?: Attachment[]
  onAttachFiles?: (files: FileList) => void
  onRemoveAttachment?: (id: string) => void
  footer?: string
  /**
   * Opening prompt for a brand-new project (dashboard handoff). Used once:
   * when the project has no conversations yet, the first one is created
   * and this prompt is sent through the agent automatically.
   */
  firstPrompt?: string | null
  /**
   * Length/shape the user already picked (dashboard prompt box / project
   * spec). The first-message composer defaults to these instead of 5s /
   * 16:9, so a "10 seconds, 9:16" choice survives into the playground
   * instead of resetting to the default there.
   */
  defaultFormat?: string | null
  defaultSecs?: number | null
  /** Live working flag for the preview pane (real generating state). */
  onWorkingChange?: (working: boolean) => void
  /** The preview's Stop button halts the agent stream through this. */
  stopRef?: { current: (() => void) | null }
}) {
  const [sid, setSid] = useState<string | null>(serverProjectId)
  const [listed, setListed] = useState(false)
  const [, setConversations] = useState<AgentConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [initial, setInitial] = useState<UIMessage[] | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [listWarning, setListWarning] = useState<string | null>(null)
  const [ensuring, setEnsuring] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  useEffect(() => {
    onWorkingChange?.(working)
  }, [working, onWorkingChange])
  // Single wallet instance per card: the thread guards sends with it and
  // refreshes it when turns settle; header pills poll on their own cache.
  const wallet = useCredits()
  const seeded = useRef(new Set<string>())
  const handoffSent = useRef(false)
  /** Last good list per project — restored instead of wiped on reload failure. */
  const listCache = useRef<{
    sid: string
    convs: AgentConversation[]
    activeId: string | null
  } | null>(null)
  /** Set when the user starts a chat while the list is still in flight. */
  const createdDuringList = useRef(false)
  /**
   * The dashboard handoff is consumed once per project id, so the listing
   * effect reads it as of the `sid` change rather than as a live value —
   * adding it to the deps would re-list whenever the prompt moved.
   */
  const handoffRef = useRef(firstPrompt)

  useEffect(() => {
    setSid(serverProjectId)
  }, [serverProjectId])

  // Ensure a server project first (agent tools operate on it).
  useEffect(() => {
    let live = true
    if (!agentConfigured()) {
      setBootError(
        IS_PROD
          ? "The AI service isn't configured — try again in a moment."
          : "Backend URL isn't set — add VITE_API_URL, then reload."
      )
      return
    }
    if (sid) return
    setEnsuring(true)
    onEnsureServerProject()
      .then((id) => {
        if (!live) return
        setEnsuring(false)
        if (id) setSid(id)
        else setBootError(backendDownCopy())
      })
      .catch(() => {
        if (live) {
          setEnsuring(false)
          setBootError(backendDownCopy())
        }
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid === null])

  // Then list conversations.
  useEffect(() => {
    let live = true
    if (!sid) return
    setListed(false)
    setListWarning(null)
    setActiveId(null)
    setInitial(null)
    setPendingPrompt(null)
    createdDuringList.current = false
    const prompt = handoffRef.current
    listAgentConversations(sid)
      .then(async (cs) => {
        if (!live) return
        setListed(true)
        if (createdDuringList.current) {
          // The user started a chat while this was in flight. Keep their
          // chat selected and just fold the fetched list in behind it —
          // resetting here is what used to swallow the opening prompt.
          setConversations((prev) => mergeById(prev, cs))
          return
        }
        setConversations(cs)
        if (cs.length > 0) {
          const latest = cs[0]!
          setActiveId(latest.id)
          listCache.current = { sid, convs: cs, activeId: latest.id }
          try {
            if (live) setInitial(await loadAgentMessages(sid, latest.id))
          } catch {
            if (live) setInitial([])
          }
        } else {
          setActiveId(null)
          setInitial([])
          // Brand-new project with a dashboard prompt: create the first
          // conversation and send it through the agent automatically.
          if (prompt && !handoffSent.current) {
            handoffSent.current = true
            try {
              const conv = await createAgentConversation(sid, prompt.slice(0, 60))
              if (!live) return
              setConversations([conv])
              setActiveId(conv.id)
              listCache.current = { sid, convs: [conv], activeId: conv.id }
              setInitial([])
              setPendingPrompt(prompt)
            } catch (e) {
              if (live) setBootError(e instanceof Error ? e.message : "Failed to start chat")
            }
          }
        }
      })
      .catch((e) => {
        if (!live) return
        setListed(true)
        if (createdDuringList.current) return
        // A failed reload must never wipe the list: restore the last good
        // one for this project (a reload error used to empty the whole
        // conversation list). Only a project with nothing cached before
        // falls back to an empty composer.
        const cached = listCache.current
        if (cached && cached.sid === sid && cached.convs.length > 0) {
          setConversations(cached.convs)
          setActiveId(cached.activeId)
          if (cached.activeId) {
            loadAgentMessages(sid, cached.activeId)
              .then((ms) => {
                if (live) setInitial(ms)
              })
              .catch(() => {
                if (live) setInitial([])
              })
          } else if (live) {
            setInitial([])
          }
        } else {
          setConversations([])
          setActiveId(null)
          setInitial([])
        }
        setListWarning(
          `${e instanceof Error ? e.message : "Couldn't load your chats"} — showing what I have.`
        )
      })
    return () => {
      live = false
    }
  }, [sid])

  /**
   * Every entry point into a new chat funnels through here, so this ref is
   * the one place that has to be synchronous: clearing the composer's text is
   * a render away, which leaves a window where a second click, Enter, or
   * Enter-then-click still sees the old value and starts a second
   * conversation.
   */
  const creating = useRef(false)

  const createConversation = async (firstMessage?: string) => {
    if (!sid || creating.current) return
    creating.current = true
    // The list request may still be in flight; flag it so its resolution
    // won't reset the chat we're about to select.
    createdDuringList.current = true
    setListWarning(null)
    setBootError(null)
    try {
      const conv = await createAgentConversation(sid, (firstMessage ?? "Untitled").slice(0, 60))
      setConversations((cs) => {
        const next = [conv, ...cs]
        listCache.current = { sid, convs: next, activeId: conv.id }
        return next
      })
      setActiveId(conv.id)
      setInitial([])
      if (firstMessage) setPendingPrompt(firstMessage)
    } catch (e) {
      // The text stays in the composer, so the user can just press send again.
      createdDuringList.current = false
      setBootError(
        e instanceof Error ? e.message : "Couldn't start the chat — try again."
      )
    } finally {
      creating.current = false
    }
  }

  // Seed legacy thread once per empty conversation for continuity.
  useEffect(() => {
    if (!activeId || !initial || initial.length > 0 || seeded.current.has(activeId)) return
    if (legacyThread.length === 0 || pendingPrompt) return
    seeded.current.add(activeId)
    void seedAgentConversation(activeId, legacyThread)
      .then(async () => {
        if (sid) {
          try {
            setInitial(await loadAgentMessages(sid, activeId))
          } catch {
            /* keep empty */
          }
        }
      })
      .catch(() => {})
  }, [activeId, initial, legacyThread, sid, pendingPrompt])

  /**
   * Split so the panel can stay interactive. `booting` gates only the
   * composer (there is nothing to send to until a project exists) and
   * shows up as an inline strip; `hydrating` is the sole case with
   * genuinely nothing to render yet.
   */
  const booting = ensuring || !listed
  const hydrating = activeId !== null && initial === null

  const pill = working
    ? {
        cls: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        dot: "animate-pulse bg-amber-500",
        label: "Working",
      }
    : booting
      ? {
          cls: "border-primary/30 bg-primary/10 text-primary",
          dot: "animate-pulse bg-primary",
          label: "Connecting",
        }
      : {
          cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          dot: "bg-emerald-500",
          label: "Ready",
        }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-[13px] font-semibold tracking-[-0.01em]">SlyxUp</span>
        {!bootError && (
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums",
              pill.cls
            )}
            aria-live="polite"
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", pill.dot)} />
            {pill.label}
          </span>
        )}
      </div>

      {bootError ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
            <TriangleAlert className="size-4 text-destructive" />
          </span>
          <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground">{bootError}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-8 text-[12px]"
            onClick={() => {
              setBootError(null)
              setEnsuring(false)
              // Re-run the ensure step by clearing the sid when it was never set,
              // otherwise just re-list.
              if (!sid) {
                setEnsuring(true)
                onEnsureServerProject()
                  .then((id) => {
                    setEnsuring(false)
                    if (id) setSid(id)
                    else setBootError(backendDownCopy())
                  })
                  .catch(() => {
                    setEnsuring(false)
                    setBootError(backendDownCopy())
                  })
              } else {
                setListed(false)
                listAgentConversations(sid)
                  .then((cs) => {
                    setListed(true)
                    setConversations(cs)
                    if (cs.length > 0) {
                      const latest = cs[0]!
                      setActiveId(latest.id)
                      loadAgentMessages(sid, latest.id)
                        .then(setInitial)
                        .catch(() => setInitial([]))
                    } else {
                      setInitial([])
                    }
                  })
                  .catch(() => {
                    setListed(true)
                    setBootError(backendDownCopy())
                  })
              }
            }}
          >
            Retry connection
          </Button>
        </div>
      ) : sid && activeId && initial ? (
        <AgentThread
          key={activeId}
          serverProjectId={sid}
          conversationId={activeId}
          initialMessages={initial}
          initialPrompt={pendingPrompt}
          onPromptSent={() => setPendingPrompt(null)}
          attachments={attachments}
          onAttachFiles={onAttachFiles}
          onRemoveAttachment={onRemoveAttachment}
          onArtifact={onArtifact}
          onPendingChange={setWorking}
          stopRef={stopRef}
          refreshCredits={wallet.refresh}
        />
      ) : (
        // The composer stays mounted through the whole boot. It is disabled
        // only until there is a project to send to, so the user can read,
        // type and hit send the moment it exists.
        <div className="flex min-h-0 flex-1 flex-col">
          {booting && (
            <StatusStrip label={ensuring ? "Preparing your project…" : "Loading chat…"} />
          )}
          {listWarning && <WarnStrip label={listWarning} />}
          {!bootError && handoffRef.current && !activeId ? (
            // Studio handoff: the description is already on its way — asking
            // for length/shape again here is a confusing duplicate input.
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Loader2 className="size-4 animate-spin" />
              </span>
              <p className="mt-1 text-sm font-semibold">Starting your clip…</p>
              <p className="max-w-[26ch] text-[13px] leading-relaxed text-muted-foreground">
                Sending your description over — the first version renders next door.
              </p>
            </div>
          ) : hydrating || !sid ? (
            // No project yet (or history still loading): a skeleton, NOT
            // the first-message composer. The old code mounted a disabled
            // NewChatComposer here — a second "prompt box" sitting above
            // the thread's real composer that ate typed text on unmount
            // when the project arrived. Nothing to type into until there
            // is something to send to.
            <ConversationSkeleton />
          ) : (
            <NewChatComposer
              sid={sid}
              onStart={createConversation}
              initialFormat={defaultFormat}
              initialSecs={defaultSecs}
            />
          )}
        </div>
      )}

      {footer && (
        <div className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">{footer}</div>
      )}
    </div>
  )
}

/**
 * First-message composer with clip-length + aspect pickers. Both ride along
 * with the opening message, so the agent builds directly instead of
 * asking about time or shape. One of each is always chosen (5s, 16:9)
 * and the user can change either.
 */
function NewChatComposer({
  sid,
  onStart,
  initialFormat,
  initialSecs,
}: {
  sid: string | null
  onStart: (text: string) => Promise<void>
  /** Picks the user already made elsewhere — never reset to defaults. */
  initialFormat?: string | null
  initialSecs?: number | null
}) {
  const [value, setValue] = useState("")
  const [secs, setSecs] = useState<number>(() =>
    initialSecs != null && DURATIONS.includes(initialSecs as (typeof DURATIONS)[number])
      ? initialSecs
      : DEFAULT_DURATION
  )
  const [format, setFormat] = useState<string>(() =>
    initialFormat && (FORMATS as string[]).includes(initialFormat) ? initialFormat : FORMATS[0]!
  )
  const [starting, setStarting] = useState(false)

  const send = () => {
    const v = value.trim()
    if (!v || starting) return
    setStarting(true)
    void onStart(`${v} ${specSuffix(secs, format)}`).finally(() =>
      setStarting(false)
    )
  }

  return (
    <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:px-4">
      <p className="pb-3 text-[12px] text-muted-foreground">
        Describe your clip — pick a length and shape, clips run at most 15 seconds.
      </p>
      <div className="rounded-2xl border bg-card transition-colors focus-within:border-primary/50">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={2}
          disabled={!sid || starting}
          placeholder="Describe your clip… (Enter sends, Shift+Enter for a new line)"
          aria-label="Start chatting"
          className="max-h-[120px] w-full resize-none bg-transparent px-3 pb-1 pt-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        <div className="flex items-center gap-1.5 overflow-x-auto px-2 pb-2">
          <span className="shrink-0 pl-1.5 text-[11px] text-muted-foreground">Length</span>
          {DURATIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSecs(n)}
              aria-pressed={secs === n}
              title={`${n} seconds`}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-all duration-200 active:scale-95",
                secs === n
                  ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "text-muted-foreground hover:border-primary/60 hover:text-foreground"
              )}
            >
              {n}s
            </button>
          ))}
          <div className="mx-1 hidden h-4 w-px shrink-0 bg-border min-[420px]:block" />
          {FORMATS.map((f) => {
            const Icon = formatIcon(f)
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                title={`${f} aspect ratio`}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-all duration-200 active:scale-95",
                  format === f
                    ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "text-muted-foreground hover:border-primary/60 hover:text-foreground"
                )}
              >
                <Icon className="size-3" />
                {f}
              </button>
            )
          })}
          <div className="min-w-2 flex-1" />
          <Button
            size="icon"
            disabled={!sid || !value.trim() || starting}
            onClick={send}
            aria-label="Send message"
            className="size-9 shrink-0 cursor-pointer rounded-full shadow-lg shadow-primary/25 transition-all duration-200 hover:shadow-primary/40 disabled:cursor-default disabled:shadow-none sm:size-8"
          >
            {starting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
