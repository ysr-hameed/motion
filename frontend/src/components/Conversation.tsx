import { useEffect, useMemo, useRef, useState } from "react"
import type { UIMessage } from "ai"
import { useAgentChat } from "@cloudflare/ai-chat/react"
import { TEMPLATES as TEMPLATE_CHIPS } from "~/lib/templates"
import { fetchChatModel, setChatModel, type ModelOption } from "~/lib/composition"

const TOOL_LABEL: Record<string, string> = {
  load_skill: "load skill",
  get_canvas: "read canvas",
  plan_motion: "plan",
  pre_validate_plan: "pre-validate",
  constraint_solve: "solve constraints",
  dependency_resolve: "resolve imports",
  auto_fix_code: "auto-fix",
  asset_search: "find asset",
  asset_optimize: "optimize asset",
  font_suggest: "suggest fonts",
  intent_deep_analyze: "analyze intent",
  intent_questionnaire: "questionnaire",
  decision_make: "decide",
  preference_apply: "apply prefs",
  brand_learn: "learn brand",
  design_analyze: "analyze design",
  performance_profile: "profile perf",
  accessibility_audit: "audit a11y",
  template_apply_intelligent: "apply template",
  template_list: "list templates",
  blackboard_write: "post note",
  blackboard_read: "read note",
  blackboard_list: "list notes",
  execute_batch: "batch",
  prefetch_tools: "prefetch",
  copy_generate: "write copy",
  voiceover_generate: "time VO",
  music_search: "find music",
  sound_effects_library: "pick SFX",
  subtitle_generate: "caption",
  icon_generate: "pick icon",
  background_generate: "make bg",
  export_preset: "export spec",
  export_bundle: "export bundle",
  cdn_publish: "publish",
  thumbnail_generate: "thumbnail",
  watermark_apply: "watermark",
  analytics_track: "track",
  version_tag: "tag version",
  template_save: "save template",
  share_create: "share",
  comment_add: "comment",
  feedback_request: "request feedback",
  team_invite: "invite",
  activity_log: "activity",
  three_scene_create: "3D scene",
  three_camera_path: "3D camera",
  three_model_animate: "3D animate",
  load_motion_preset: "motion preset",
  layout_plan: "plan layout",
  auto_enhance_motion: "enhance motion",
  verify_no_errors: "verify",
  bulk_edit: "bulk edit",
  read_file: "read source",
  write_composition: "write",
  edit_file: "edit",
  validate_composition: "validate",
  preview_composition: "preview",
  read_render_report: "verify render",
  review_motion: "review motion",
  list_versions: "list versions",
  restore_version: "restore",
}

function toolName(part: Record<string, unknown>): string {
  const n = part.toolName
  if (typeof n === "string") return TOOL_LABEL[n] ?? n
  return TOOL_LABEL[String(part.type).replace(/^tool-/, "")] ?? "tool"
}

/** Compact one-line summary of what a tool was asked and what it returned. */
function toolSummary(part: Record<string, unknown>): string {
  const input = part.input as Record<string, unknown> | undefined
  const output = part.output as Record<string, unknown> | undefined

  if (input?.skill) return String(input.skill)
  if (input?.version) return `v${input.version}`
  if (input?.focus) return String(input.focus)
  if (input?.title) return String(input.title)
  if (input?.find) return "targeted edit"

  if (output?.error) return String(output.error)
  if (output?.errors && Array.isArray(output.errors)) return `${output.errors.length} error(s)`
  if (output?.warnings && Array.isArray(output.warnings) && output.warnings.length > 0) {
    return `${output.warnings.length} warning(s)`
  }
  if (output?.version) return `v${output.version}`
  if (output?.findings && Array.isArray(output.findings)) {
    return `${output.findings.length} finding(s)`
  }
  if (output?.content) return `${Math.round(String(output.content).length / 1000)}kB`
  if (output?.code) return `${String(output.code).split("\n").length} lines`
  if (output?.ok === false) return "rejected"
  if (output?.ok === true) return "ok"
  return ""
}

type Part = Record<string, unknown>

/**
 * Minimal chat markdown: fenced code blocks, headings, quotes, lists,
 * bold/italic/inline-code/links. No dependency — the agent writes
 * markdown constantly (code snippets, plans) and raw asterisks
 * read as noise.
 */
function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className="min-w-0 space-y-1.5 text-[13.5px] leading-relaxed break-words">
      {blocks}
    </div>
  )
}

function renderInline(src: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  // `code`, **bold**, *italic*, [label](url)
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  const pushText = (s: string) => {
    if (s) out.push(<span key={`${keyPrefix}t${k++}`}>{s}</span>)
  }
  while ((m = re.exec(src)) !== null) {
    pushText(src.slice(last, m.index))
    last = m.index + m[0].length
    const tok = m[0]
    if (tok.startsWith("`")) {
      out.push(
        <code key={`${keyPrefix}c${k++}`} className="rounded-xs bg-panel-2 px-1 py-px font-mono text-[12px] text-tungsten">
          {tok.slice(1, -1)}
        </code>
      )
    } else if (tok.startsWith("**")) {
      out.push(<strong key={`${keyPrefix}b${k++}`} className="font-semibold text-paper">{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith("*")) {
      out.push(<em key={`${keyPrefix}i${k++}`}>{tok.slice(1, -1)}</em>)
    } else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)
      if (lm) {
        out.push(
          <a key={`${keyPrefix}l${k++}`} href={lm[2]} target="_blank" rel="noreferrer" className="text-tungsten underline">
            {lm[1]}
          </a>
        )
      } else pushText(tok)
    }
  }
  pushText(src.slice(last))
  return out
}

function parseMarkdown(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const lines = text.split("\n")
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]!
    // Fenced code block
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) buf.push(lines[i++]!)
      i++
      out.push(
        <pre key={`md${k++}`} className="overflow-x-auto rounded-md border border-line bg-panel-2 p-2.5 font-mono text-[12px] leading-relaxed text-paper scroll-thin">
          {lang && <span className="mb-1 block text-[10px] text-dim">{lang}</span>}
          <code>{buf.join("\n")}</code>
        </pre>
      )
      continue
    }
    // Heading
    const h = /^(#{1,4})\s+(.*)/.exec(line)
    if (h) {
      const level = h[1]!.length
      out.push(
        <p key={`md${k++}`} className={level <= 2 ? "pt-1 text-[14px] font-semibold text-paper" : "pt-0.5 text-[13.5px] font-semibold text-paper"}>
          {renderInline(h[2]!, `h${k}`)}
        </p>
      )
      i++
      continue
    }
    // Quote
    if (/^>\s?/.test(line)) {
      out.push(
        <p key={`md${k++}`} className="border-l-2 border-tungsten/60 pl-2.5 text-muted">
          {renderInline(line.replace(/^>\s?/, ""), `q${k}`)}
        </p>
      )
      i++
      continue
    }
    // Bulleted list run
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ""))
      out.push(
        <ul key={`md${k++}`} className="space-y-0.5">
          {items.map((it, j) => (
            <li key={j} className="flex gap-2">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-tungsten/60" />
              <span>{renderInline(it, `li${k}-${j}`)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }
    // Numbered list run
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+[.)]\s+/, ""))
      out.push(
        <ol key={`md${k++}`} className="space-y-0.5">
          {items.map((it, j) => (
            <li key={j} className="flex gap-2">
              <span className="font-mono text-[11px] text-tungsten">{j + 1}.</span>
              <span>{renderInline(it, `ol${k}-${j}`)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }
    if (!line.trim()) { i++; continue }
    out.push(<p key={`md${k++}`}>{renderInline(line, `p${k}`)}</p>)
    i++
  }
  return out
}

function ToolCall({ part }: { part: Part }) {
  const state = String(part.state ?? "pending")
  const done = state === "output-available" || state === "output-error"
  const failed = state === "output-error"
  const summary = toolSummary(part)

  return (
    <div className="tick-in my-1 flex items-baseline gap-2 font-mono text-[11px]">
      <span
        className={[
          "h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full",
          failed ? "bg-bad" : done ? "bg-ok" : "live-dot bg-tungsten",
        ].join(" ")}
        aria-hidden="true"
      />
      <span className={done ? "text-muted" : "text-tungsten"}>{toolName(part)}</span>
      {summary && <span className="truncate text-dim">{summary}</span>}
    </div>
  )
}

function Attachments({ parts }: { parts: Part[] }) {
  const files = parts.filter((p) => p.type === "file") as Array<
    Part & { mediaType?: string; filename?: string; url?: string }
  >
  if (files.length === 0) return null
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <span
          key={i}
          className="flex items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-1.5 py-1 font-mono text-[10px] text-muted"
        >
          {typeof f.mediaType === "string" && f.mediaType.startsWith("image/") && f.url ? (
            <img src={f.url} alt={f.filename ?? "attachment"} className="h-6 w-6 rounded-xs object-cover" />
          ) : (
            <span aria-hidden="true">▤</span>
          )}
          {f.filename ?? "attachment"}
        </span>
      ))}
    </div>
  )
}

/**
 * One thought — a run of consecutive reasoning parts rendered as a
 * single collapsible, in place. The stream delivers thinking, tool
 * calls and text interleaved; grouping only consecutive reasoning
 * keeps each thought next to the tool call it led to (opencode
 * style) instead of piling everything at the top of the bubble.
 */
function Thought({ text }: { text: string }) {
  const trimmed = text.trim()
  if (!trimmed) return null
  const words = trimmed.split(/\s+/).length
  return (
    <details className="group my-2 rounded-sm border border-line-soft bg-panel-2/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[11px] text-dim transition-colors hover:text-muted">
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          aria-hidden="true"
          className="transition-transform group-open:rotate-90"
        >
          <path d="M2 0l4 4-4 4z" fill="currentColor" />
        </svg>
        <span className="font-mono">thinking</span>
        <span className="font-mono text-dim/70">{words}w</span>
      </summary>
      <p className="max-h-56 overflow-y-auto px-2.5 pb-2.5 text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted scroll-thin">
        {trimmed}
      </p>
    </details>
  )
}

function Bubble({ message }: { message: UIMessage }) {
  const parts = message.parts as unknown as Part[]
  const isUser = message.role === "user"

  // Render parts in stream order: consecutive reasoning merges into one
  // Thought, tool calls and text land where they happened.
  const nodes: React.ReactNode[] = []
  let thought = ""
  const flushThought = () => {
    if (thought.trim()) {
      nodes.push(<Thought key={`th${nodes.length}`} text={thought} />)
      thought = ""
    }
  }
  parts.forEach((p, i) => {
    if (p.type === "reasoning") {
      if (typeof p.text === "string") thought += p.text
      return
    }
    flushThought()
    if (typeof p.type === "string" && p.type.startsWith("tool-")) {
      nodes.push(<ToolCall key={`tl${i}`} part={p} />)
    } else if (p.type === "text" && typeof p.text === "string" && p.text) {
      nodes.push(
        isUser ? (
          <p key={`tx${i}`} className="whitespace-pre-wrap text-[13.5px] leading-relaxed break-words">
            {String(p.text)}
          </p>
        ) : (
          <Markdown key={`tx${i}`} text={String(p.text)} />
        )
      )
    }
  })
  flushThought()

  return (
    <div className={isUser ? "flex justify-end" : ""}>
      <div className={isUser ? "max-w-[85%] rounded-md bg-tungsten px-3 py-2 text-ink" : "w-full min-w-0"}>
        {isUser && <Attachments parts={parts} />}
        {nodes}
      </div>
    </div>
  )
}

/** The hook is called once in App so the stage and this panel share one stream. */
type UseAgentChatReturn = ReturnType<typeof useAgentChat>

/**
 * A turn that produces nothing for this long is treated as failed.
 *
 * This has to account for the gateway's 5 requests-per-minute limit. A turn
 * that runs the whole workflow is ~11 model calls, each paced roughly 12s
 * apart, so a healthy turn legitimately runs for minutes — a 45s deadline fired
 * during normal operation in testing, on a turn that then completed correctly.
 * 150s is longer than any legitimate gap between two message parts while still
 * bounding a genuinely dead turn.
 */
const STALL_MS = 150_000

interface Props {
  chat: UseAgentChatReturn
  sessionId: string
  onFiles: (files: File[]) => void
}

export function Conversation({ chat, sessionId }: Props) {
  const { messages, sendMessage, clearHistory, stop, status, isStreaming, isRecovering, regenerate } = chat as UseAgentChatReturn & {
    regenerate?: () => void
  }
  const streamError = (chat as { error?: unknown }).error as Error | null | undefined
  const connectionError = (chat as { connectionError?: { message?: string; reason?: string } | null }).connectionError

  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState<File[]>([])
  const [stalled, setStalled] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [activeModel, setActiveModel] = useState("")
  const [modelBusy, setModelBusy] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastActivity = useRef(Date.now())
  // True while the user sits at (or near) the bottom. Streaming tool
  // updates re-render on every part — yanking to the bottom on each
  // one made it impossible to scroll up and read history mid-turn.
  // Now: follow only while stuck to the bottom; otherwise show a
  // "jump to latest" pill instead of stealing the scroll.
  const stickToBottom = useRef(true)

  const busy = status === "submitted" || status === "streaming"

  const nearBottom = () => {
    const el = scroller.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 90
  }

  useEffect(() => {
    if (stickToBottom.current) {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
    }
    lastActivity.current = Date.now()
  }, [messages])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      stickToBottom.current = nearBottom()
      // Re-render only the pill: store stickiness in state.
      setAtBottom(stickToBottom.current)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  // Model switcher: list + current pick live in the Chat Durable Object,
  // so every tab on this session agrees. Applies to the next message sent.
  useEffect(() => {
    let dead = false
    fetchChatModel(sessionId)
      .then((r) => {
        if (dead) return
        setModels(r.available)
        setActiveModel(r.model)
      })
      .catch(() => {
        if (!dead) setModelError("models unavailable")
      })
    return () => {
      dead = true
    }
  }, [sessionId])

  async function changeModel(id: string) {
    if (!id || id === activeModel || modelBusy) return
    setModelBusy(true)
    setModelError(null)
    try {
      const r = await setChatModel(sessionId, id)
      setActiveModel(r.model)
    } catch (err) {
      setModelError(err instanceof Error ? err.message : String(err))
    } finally {
      setModelBusy(false)
    }
  }

  // Timeline / Inspector / ProgressView suggest edits as window events.
  // They land in the draft — the user still sends, the agent still writes.
  useEffect(() => {
    const onSuggest = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (typeof text === "string" && text) setDraft(text)
    }
    window.addEventListener("motion:suggest", onSuggest)
    return () => window.removeEventListener("motion:suggest", onSuggest)
  }, [])

  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current > STALL_MS) {
        stop()
        setStalled(true)
      }
    }, 10_000)
    return () => clearInterval(t)
  }, [busy, stop])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if ((!text && pending.length === 0) || busy || sending) return
    setDraft("")
    setStalled(false)
    // The user just sent — re-stick to the bottom so their message
    // and the reply are followed.
    stickToBottom.current = true
    setAtBottom(true)

    if (pending.length > 0) {
      setSending(true)
      try {
        // The model is vision-capable, so references go up as real file parts
        // rather than as a description of what is in them.
        const files = await Promise.all(
          pending.map(async (f) => ({
            type: "file" as const,
            mediaType: f.type || "application/octet-stream",
            filename: f.name,
            url: await toDataUrl(f),
          }))
        )
        sendMessage({ text, files })
        setPending([])
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setPending([])
      } finally {
        setSending(false)
      }
      return
    }
    sendMessage({ text })
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return
    setPending((p) => [...p, ...files].slice(0, 4))
    event.target.value = ""
  }

  return (
    <aside className="flex min-h-0 flex-col border-line lg:border-l" aria-label="Conversation">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="eyebrow">brief</span>
        {models.length > 0 ? (
          <select
            value={activeModel}
            disabled={busy || modelBusy}
            onChange={(e) => void changeModel(e.target.value)}
            title={models.find((m) => m.id === activeModel)?.blurb ?? "Applies to the next message"}
            aria-label="Model"
            className="max-w-[170px] shrink-0 truncate rounded border border-line bg-panel-2 px-1.5 py-1 font-mono text-[10px] text-muted focus:border-tungsten focus:outline-none disabled:opacity-40"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id} title={m.blurb}>
                {m.label}
              </option>
            ))}
          </select>
        ) : null}
        {modelError ? <span className="font-mono text-[10px] text-bad">{modelError}</span> : null}
        <button
          type="button"
          onClick={clearHistory}
          disabled={isStreaming}
          className="ml-auto font-mono text-[10px] text-dim transition-colors hover:text-paper disabled:opacity-40"
        >
          new cut
        </button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 scroll-thin">
        {messages.length === 0 && <EmptyBrief />}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {busy && <Working label={isRecovering ? "recovering" : "working"} />}
        {status === "error" && !busy && (
          <div className="border-l-2 border-bad pl-2.5 text-[11.5px]">
            <p className="text-bad">
              Failed: {streamError instanceof Error ? streamError.message : streamError ? String(streamError) : "stream broke — retry"}
              {connectionError?.message ? ` (${connectionError.message})` : ""}
            </p>
            <button
              type="button"
              onClick={() => (regenerate ? regenerate() : undefined)}
              className="mt-1 font-mono text-[10px] text-muted underline hover:text-paper"
            >
              retry
            </button>
          </div>
        )}
        {stalled && !busy && (
          <p className="border-l-2 border-bad pl-2.5 text-[11.5px] text-muted">
            The model stopped responding. Send again to retry.
          </p>
        )}
        {error && <p className="border-l-2 border-bad pl-2.5 text-[11.5px] text-bad">{error}</p>}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => {
            stickToBottom.current = true
            setAtBottom(true)
            scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
          }}
          className="mx-auto -mt-9 mb-1 flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel-2/95 px-3 py-1 font-mono text-[10px] text-muted shadow-lg backdrop-blur transition-colors hover:border-tungsten hover:text-paper"
        >
          ↓ latest
        </button>
      )}

      {pending.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-line px-3 pt-2.5">
          {pending.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
              className="flex items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-1.5 py-1 font-mono text-[10px] text-muted hover:border-bad hover:text-bad"
              aria-label={`Remove ${f.name}`}
            >
              {f.name} ✕
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={onPick}
            className="hidden"
            aria-label="Attach reference"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            aria-label="Attach a reference image or PDF"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line text-dim transition-colors hover:border-tungsten hover:text-tungsten disabled:opacity-40"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M7 1v8M4 4l3-3 3 3M2 10v2.5h10V10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(e)
              }
            }}
            rows={1}
            disabled={busy}
            placeholder="Describe the clip…"
            aria-label="Message"
            className="max-h-32 min-h-9 flex-1 resize-none rounded border border-line bg-panel-2 px-2.5 py-2 text-[13px] text-paper placeholder:text-dim focus:border-tungsten focus:outline-none disabled:opacity-50"
          />

          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="h-9 shrink-0 rounded border border-line px-3 font-mono text-[11px] text-muted transition-colors hover:border-bad hover:text-bad"
            >
              stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim() && pending.length === 0}
              className="h-9 shrink-0 rounded bg-tungsten px-3.5 font-medium text-ink transition-opacity disabled:opacity-40"
            >
              send
            </button>
          )}
        </div>
      </form>
    </aside>
  )
}

function EmptyBrief() {
  return (
    <div className="pt-6">
      <p className="eyebrow mb-3">nothing on the timeline</p>
      <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
        {[
          "A 5s product reveal with the logo punching in on an overshoot",
          "Kinetic type that masks a headline in per character",
          "A lower third that wipes in under a talking head",
        ].map((s) => (
          <li key={s} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-tungsten/60" />
            <button
              type="button"
              className="text-left transition-colors hover:text-paper"
              onClick={() => {
                const ta = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')
                if (ta) {
                  const setter = Object.getOwnPropertyDescriptor(
                    HTMLTextAreaElement.prototype,
                    "value"
                  )?.set
                  setter?.call(ta, s)
                  ta.dispatchEvent(new Event("input", { bubbles: true }))
                }
              }}
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
      <p className="eyebrow mt-5 mb-2">or start from a template</p>
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATE_CHIPS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("motion:suggest", { detail: t.prompt }))}
            className="rounded border border-line px-2 py-1 text-[11.5px] text-muted transition-colors hover:border-tungsten hover:text-paper"
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Live "the agent is actually working" state, driven by real tool activity. */
function Working({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-tungsten">
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-tungsten" aria-hidden="true" />
      {label}
    </div>
  )
}

/** Small files go inline; anything large would blow the request budget. */
const MAX_INLINE_BYTES = 4 * 1024 * 1024

/**
 * FileReader is the only way to read a File synchronously enough here without
 * pulling in a promise dance, and base64 is what the model message format wants.
 * Returns a data URL.
 */
function toDataUrl(file: File): Promise<string> {
  if (file.size > MAX_INLINE_BYTES) {
    return Promise.reject(new Error(`${file.name} is over 4MB — attach a smaller reference.`))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}
