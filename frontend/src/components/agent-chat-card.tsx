import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai"
import { useChat } from "@ai-sdk/react"
import {
  Check,
  ChevronDown,
  Loader2,
  Paperclip,
  Plus,
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
 * Plain-text lite renderer: paragraphs + bullet lists, so the assistant's
 * sentences don't arrive as a wall of text. No markdown dependency.
 */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n")
  const blocks: Array<{ type: "p" | "ul"; lines: string[] }> = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    const bullet = line.trim().match(/^[•\-*]\s+(.*)$/)
    if (bullet) {
      const last = blocks[blocks.length - 1]
      if (last?.type === "ul") last.lines.push(bullet[1])
      else blocks.push({ type: "ul", lines: [bullet[1]] })
    } else {
      const last = blocks[blocks.length - 1]
      if (last?.type === "p") last.lines.push(line.trim())
      else blocks.push({ type: "p", lines: [line.trim()] })
    }
  }
  if (blocks.length === 0) return null
  return (
    <span className="block">
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i} className="my-1 list-disc space-y-0.5 pl-4 marker:text-muted-foreground">
            {b.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        ) : (
          <span key={i} className="mb-1 block last:mb-0">
            {b.lines.join(" ")}
          </span>
        )
      )}
    </span>
  )
}

/**
 * One live line while the agent works — never a checklist.
 * Successful steps collapse away once done; only the current activity
 * (or a failure) stays visible, so a finished turn reads as conversation,
 * not a build log.
 */
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
  // Director's slate: dark mini-card that ties the chat to the screening
  // room next to it. Tapping an option sends it instantly.
  return (
    <div className="mt-1.5 flex flex-col gap-2 overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 p-3 text-white shadow-lg">
      <div aria-hidden className="pointer-events-none -mx-3 -mt-3 h-8 bg-grid-dark opacity-60" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
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
              className="max-w-full cursor-pointer rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-left text-[11px] font-medium break-words text-white/90 transition-all duration-200 hover:-translate-y-px hover:border-white/30 hover:bg-white/[0.14] disabled:cursor-default disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      <p className="-mb-0.5 text-[10px] text-white/40">
        {answered ? "Answered — continue below" : "Tap an option to send it instantly"}
      </p>
    </div>
  )
}

function assistantText(msg: UIMessage): string {
  return msg.parts
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
  const published = !streaming && !text ? publishedVersion(tools) : null
  if (!hasVisible) {
    if (!streaming) return null
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
      <ActivityLine parts={tools} />
      {reasoning && <ReasoningBlock text={reasoning} streaming={streaming} />}
      {published != null && (
        <div className="break-words text-sm leading-relaxed">
          Saved as v{published} — it&apos;s on stage now. Tell me what to change next.
        </div>
      )}
      {text && (
        <div className="break-words text-sm leading-relaxed">
          <RichText text={text} />
          {streaming && (
            <span aria-hidden className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse rounded-[2px] bg-primary/70 align-[-2px]" />
          )}
        </div>
      )}
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
  onArtifact: (artifact: Artifact, reply: string) => void
  onPendingChange?: (pending: boolean) => void
}) {
  const [input, setInput] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const seenArtifacts = useRef(new Set<string>())

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
          // The server rebuilds full history from storage (dedupe by id),
          // so resending the whole thread — base64 images included — on
          // every turn only burns request bytes and Worker parse/validate
          // CPU. The last 3 turns carry everything the server needs.
          const tail = Array.isArray(messages) ? messages.slice(-3) : messages
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

  // Auto-send the composer's opening prompt exactly once.
  const autoSent = useRef(false)
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
        const files = await filesFor()
        await chat.sendMessage(
          files.length > 0 ? { text: initialPrompt, files } : { text: initialPrompt }
        )
      } catch {
        autoSent.current = false
      }
    })()
    onPromptSent()
  }, [initialPrompt, chat.messages.length, chat.status, chat, onPromptSent, filesFor])

  useEffect(() => {
    // Follows the stream chunk-by-chunk (messages identity changes per
    // chunk), not just per message — otherwise a long reply streams
    // below the fold while the user stares at stale content up top.
    if (!stickRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages, pending])

  // Bridge published previews into the local version rail + player.
  useEffect(() => {
    for (const m of chat.messages) {
      if (m.role !== "assistant") continue
      for (const tp of toolPartsOf(m)) {
        if (!tp.toolCallId) continue
        if (seenArtifacts.current.has(tp.toolCallId)) continue
        const name = toolNameOf(tp)
        if (name !== "preview_composition" && name !== "render_video") continue
        if (tp.state !== "output-available") continue
        const art = asArtifact((tp.output as { artifact?: unknown } | null)?.artifact)
        if (art) {
          seenArtifacts.current.add(tp.toolCallId)
          onArtifact(art, assistantText(m))
        }
      }
    }
  }, [chat.messages, onArtifact])

  const send = (text?: string) => {
    const value = (text ?? input).trim()
    if (!value || pending || inFlight.current) return
    inFlight.current = true
    setInput("")
    void (async () => {
      try {
        const files = await filesFor()
        await chat.sendMessage(
          files.length > 0 ? { text: value, files } : { text: value }
        )
      } catch {
        inFlight.current = false
      }
    })()
  }

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
        aria-live="polite"
        aria-label="Messages"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto scrollbar-chat px-3 py-2.5 text-left"
      >
        {chat.messages.length === 0 && !pending && !initialPrompt && (
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
        {chat.messages.map((m, idx) => {
          const firstOfGroup = idx === 0 || chat.messages[idx - 1]?.role !== m.role
          const isLast = idx === chat.messages.length - 1
          const streamingThis = pending && isLast
          return m.role === "user" ? (
            <div
              key={m.id}
              className="msg-in max-w-[85%] self-end break-words rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
            >
              {m.parts.filter((p) => p.type === "file").length > 0 && (
                <span className="mb-1.5 flex gap-1.5">
                  {m.parts
                    .filter((p) => p.type === "file")
                    .slice(0, 3)
                    .map((p, i) => (
                      <img
                        key={i}
                        src={(p as { url?: string }).url}
                        alt="Reference"
                        className="size-14 rounded-lg border border-white/20 object-cover"
                      />
                    ))}
                </span>
              )}
              {m.parts
                .filter((p) => p.type === "text")
                .map((p, i, arr) => (
                  <span key={i}>
                    {(p as { text?: string }).text}
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
            />
          )
        })}
        {pending &&
          (chat.messages.length === 0 ||
            chat.messages[chat.messages.length - 1]?.role !== "assistant") && (
            <div
              className="msg-in flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="size-3 animate-spin text-primary" />
              Thinking…
            </div>
          )}
        {chat.error && (
          <div className="msg-in flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-[12px] shadow-lg">
            <span className="flex items-center gap-1.5 font-medium text-destructive">
              <TriangleAlert className="size-3.5" />
              Something went wrong
            </span>
            <span className="text-muted-foreground">{friendlyError(chat.error.message)}</span>
            <details className="text-[11px] text-muted-foreground/70">
              <summary className="cursor-pointer hover:text-muted-foreground">Details</summary>
              <span className="break-words">{chat.error.message}</span>
            </details>
            <div>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => chat.regenerate()}>
                Retry
              </Button>
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
          <textarea
            ref={inputRef}
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
            placeholder={pending ? "Working… press Stop to interrupt" : "Describe the change… (Enter sends)"}
            aria-label="Message"
            className="max-h-[120px] w-full min-w-0 resize-none bg-transparent px-3 pb-1 pt-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Attach reference image"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-3.5" />
            </Button>
            <div className="flex-1" />
            <Button
              size="icon"
              aria-label={pending ? "Stop generation" : "Send message"}
              title={pending ? "Stop generation" : "Send message (Enter)"}
              disabled={pending ? false : !input.trim()}
              onClick={pending ? () => chat.stop() : () => send()}
              className={cn(
                "size-8 shrink-0 cursor-pointer rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-50",
                pending && "bg-destructive hover:bg-destructive/90"
              )}
            >
              {pending ? <Square className="size-3.5" /> : <Send className="size-3.5" />}
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
}: {
  serverProjectId: string | null
  onEnsureServerProject: () => Promise<string | null>
  onArtifact: (artifact: Artifact, reply: string) => void
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
}) {
  const [sid, setSid] = useState<string | null>(serverProjectId)
  const [listed, setListed] = useState(false)
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [initial, setInitial] = useState<UIMessage[] | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [listWarning, setListWarning] = useState<string | null>(null)
  const [ensuring, setEnsuring] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const seeded = useRef(new Set<string>())
  const handoffSent = useRef(false)
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
        // A failed listing is recoverable: we still have a project to talk
        // to, so keep the composer alive and say what went wrong instead
        // of replacing the panel with an error.
        setConversations([])
        setActiveId(null)
        setInitial([])
        setListWarning(
          `${e instanceof Error ? e.message : "Couldn't load your chats"} — starting a new one.`
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
  const openConversation = async (id: string) => {
    if (!sid || id === activeId) return
    setListWarning(null)
    setActiveId(id)
    setInitial(null)
    try {
      setInitial(await loadAgentMessages(sid, id))
    } catch {
      setInitial([])
    }
  }

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
      setConversations((cs) => [conv, ...cs])
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
        <div className="flex-1" />
        {sid && conversations.length > 0 && (
          <span className="relative flex items-center">
            <select
              aria-label="Conversation"
              value={activeId ?? ""}
              onChange={(e) => {
                const v = e.target.value
                if (v === "__new") void createConversation()
                else void openConversation(v)
              }}
              className="h-7 max-w-36 cursor-pointer appearance-none truncate rounded-full border bg-background pl-2.5 pr-7 text-[11px] outline-none transition-colors hover:border-primary/50 focus-visible:ring-1 focus-visible:ring-ring"
            >
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
              <option value="__new">+ New chat</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3 text-muted-foreground" />
          </span>
        )}
        {sid && (
          <button
            type="button"
            onClick={() => void createConversation()}
            aria-label="New chat"
            title="New chat"
            className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95"
          >
            <Plus className="size-3.5" />
          </button>
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
          {hydrating ? (
            <ConversationSkeleton />
          ) : (
            <NewChatComposer sid={sid} onStart={createConversation} />
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
}: {
  sid: string | null
  onStart: (text: string) => Promise<void>
}) {
  const [value, setValue] = useState("")
  const [secs, setSecs] = useState<number>(DEFAULT_DURATION)
  const [format, setFormat] = useState<string>(FORMATS[0]!)
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
