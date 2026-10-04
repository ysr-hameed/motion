import { useEffect, useMemo, useRef, useState } from "react"
import type { UIMessage } from "ai"
import { ArrowUp, Brain, Check, ChevronDown, ChevronRight, FlaskConical, Plus, Sparkles, Square, X } from "lucide-react"
import { useAgentChat } from "@cloudflare/ai-chat/react"
import {
  fetchChatModel,
  fetchLiveModels,
  setChatModel,
  setChatThinking,
  type LiveModelStatus,
  type ModelOption,
  type ThinkingLevel,
} from "~/lib/composition"

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

/**
 * Category → icon character. Keeps the tool log scannable: a glance at the
 * icon tells you which phase is running without reading the label.
 */
const TOOL_ICON: Record<string, string> = {
  // Planning & analysis
  intent_deep_analyze: "◎",
  intent_questionnaire: "◎",
  design_analyze: "◎",
  plan_motion: "▤",
  pre_validate_plan: "▤",
  layout_plan: "▤",
  prefetch_tools: "⇣",
  execute_batch: "⇣",
  decision_make: "◆",
  // Knowledge
  load_skill: "⊞",
  get_canvas: "⊞",
  load_motion_preset: "⊞",
  brand_learn: "⊞",
  // Content & assets
  copy_generate: "✦",
  font_suggest: "✦",
  icon_generate: "✦",
  background_generate: "✦",
  asset_search: "✦",
  asset_optimize: "✦",
  music_search: "✦",
  sound_effects_library: "✦",
  voiceover_generate: "✦",
  subtitle_generate: "✦",
  // Code
  read_file: "‹›",
  write_composition: "‹›",
  edit_file: "‹›",
  auto_fix_code: "‹›",
  auto_enhance_motion: "‹›",
  bulk_edit: "‹›",
  dependency_resolve: "‹›",
  constraint_solve: "‹›",
  // Validation & review
  validate_composition: "✓",
  verify_no_errors: "✓",
  review_motion: "✓",
  performance_profile: "✓",
  accessibility_audit: "✓",
  // Preview & publish
  preview_composition: "▶",
  read_render_report: "▶",
  thumbnail_generate: "▶",
  cdn_publish: "▶",
  export_preset: "▶",
  export_bundle: "▶",
  watermark_apply: "▶",
  // Versions
  list_versions: "⊙",
  restore_version: "⊙",
  version_tag: "⊙",
}

function toolRawName(part: Record<string, unknown>): string {
  const n = part.toolName
  if (typeof n === "string") return n
  return String(part.type).replace(/^tool-/, "")
}

function toolName(part: Record<string, unknown>): string {
  const raw = toolRawName(part)
  return TOOL_LABEL[raw] ?? raw
}

function toolIcon(part: Record<string, unknown>): string {
  const raw = toolRawName(part)
  return TOOL_ICON[raw] ?? "·"
}

/** What the tool was asked (input summary). */
function toolInput(part: Record<string, unknown>): string {
  const input = part.input as Record<string, unknown> | undefined
  if (!input) return ""
  if (input.skill) return String(input.skill)
  if (input.version) return `v${input.version}`
  if (input.focus) return String(input.focus)
  if (input.title) return String(input.title)
  if (input.find) return "targeted edit"
  if (input.beatType) return String(input.beatType)
  if (input.brief && typeof input.brief === "string") return input.brief.slice(0, 40)
  return ""
}

/**
 * What the tool returned — failures only. Success needs no chip: the status
 * dot already turns green. Version numbers, line counts and byte sizes are
 * agent bookkeeping, not user information.
 */
function toolOutput(part: Record<string, unknown>): { text: string; kind: "warn" | "err" } | null {
  const output = part.output as Record<string, unknown> | undefined
  if (!output) return null
  if (output.error) return { text: String(output.error).slice(0, 90), kind: "err" }
  if (output.errors && Array.isArray(output.errors) && output.errors.length > 0) {
    const first = String((output.errors as unknown[])[0] ?? "").slice(0, 90)
    return { text: first || `${(output.errors as unknown[]).length} errors`, kind: "err" }
  }
  if (output.ok === false) return { text: "needs a fix", kind: "err" }
  if (output.warnings && Array.isArray(output.warnings) && output.warnings.length > 0) {
    return { text: `${(output.warnings as unknown[]).length} warning${(output.warnings as unknown[]).length > 1 ? "s" : ""}`, kind: "warn" }
  }
  return null
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
    <div className="min-w-0 space-y-2 text-sm leading-relaxed break-words">
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
              <span className=" text-[11px] text-tungsten">{j + 1}.</span>
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

/**
 * A tool call row. Shows:
 * - category icon (scannable at a glance)
 * - label (human-readable name)
 * - input breadcrumb (what it was asked, truncated)
 * - result chip (ok/warn/err + value) once complete
 * - inline plan beats if this is plan_motion
 * - inline validation errors if this is validate_composition
 */
function ToolCall({ part }: { part: Part }) {
  const state = String(part.state ?? "pending")
  const done = state === "output-available" || state === "output-error"
  const failed = state === "output-error"
  const icon = toolIcon(part)
  const label = toolName(part)
  const hint = toolInput(part)
  const result = done ? toolOutput(part) : null

  // Special expansions for information-rich tool outputs
  const rawName = toolRawName(part)
  const output = part.output as Record<string, unknown> | undefined
  const input = part.input as Record<string, unknown> | undefined

  // plan_motion → show beat list inline
  const beats = rawName === "plan_motion" && output?.beats && Array.isArray(output.beats)
    ? (output.beats as Array<{ from: number; to: number; what: string }>)
    : null

  // validate_composition → show errors/warnings inline
  const validationErrors =
    rawName === "validate_composition" && output?.errors && Array.isArray(output.errors)
      ? (output.errors as string[])
      : null
  const validationWarnings =
    rawName === "validate_composition" && output?.warnings && Array.isArray(output.warnings)
      ? (output.warnings as string[])
      : null

  // review_motion → show findings inline
  const findings =
    rawName === "review_motion" && output?.findings && Array.isArray(output.findings)
      ? (output.findings as string[])
      : null

  // load_skill → show skill name as pill
  const skillName = rawName === "load_skill" && input?.skill ? String(input.skill) : null

  const hasDetail = beats || (validationErrors && validationErrors.length > 0) ||
    (validationWarnings && validationWarnings.length > 0) || findings

  return (
    <div className="tick-in my-0.5">
      {/* Main row: status rail + icon + label + hint. Failures get a chip. */}
      <div className="flex items-center gap-2 text-[12px] leading-5">
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              failed ? "bg-bad" : done ? "bg-ok" : "live-dot bg-tungsten",
            ].join(" ")}
            aria-hidden="true"
          />
          <span className="text-[11px] text-dim" aria-hidden="true">{icon}</span>
        </span>
        <span className={`font-medium ${done && !failed ? "text-muted" : failed ? "text-bad" : "text-paper"}`}>{label}</span>
        {hint && <span className="truncate font-normal text-dim" title={hint}>{hint}</span>}
        {skillName && (
          <span className="shrink-0 rounded-full bg-panel-2 px-1.5 py-px text-[10px] text-muted">{skillName}</span>
        )}
        {result && (
          <span
            className={[
              "ml-auto max-w-[55%] shrink-0 truncate rounded-full px-2 py-px text-[10px]",
              result.kind === "err" ? "bg-bad/15 text-bad" : "bg-tungsten/15 text-tungsten",
            ].join(" ")}
            title={result.text}
          >
            {result.text}
          </span>
        )}
      </div>

      {/* Beat list — shown inline when plan_motion completes */}
      {beats && (
        <div className="ml-[22px] mt-1 space-y-px">
          {beats.slice(0, 8).map((b, i) => (
            <div key={i} className="flex items-baseline gap-2  text-[10px] text-dim">
              <span className="w-14 shrink-0 tabular-nums text-right text-[9px]">{b.from}–{b.to}f</span>
              <span className="truncate text-muted">{b.what}</span>
            </div>
          ))}
          {beats.length > 8 && (
            <div className=" text-[10px] text-dim ml-16">+{beats.length - 8} more</div>
          )}
        </div>
      )}

      {/* Validation errors/warnings */}
      {hasDetail && (validationErrors || validationWarnings) && (
        <div className="ml-[22px] mt-1 space-y-px">
          {(validationErrors ?? []).map((e, i) => (
            <div key={`e${i}`} className="flex items-start gap-1.5  text-[10px]">
              <span className="text-bad shrink-0">✕</span>
              <span className="text-bad/80">{e}</span>
            </div>
          ))}
          {(validationWarnings ?? []).map((w, i) => (
            <div key={`w${i}`} className="flex items-start gap-1.5  text-[10px]">
              <span className="text-tungsten shrink-0">△</span>
              <span className="text-muted">{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Review findings */}
      {findings && findings.length > 0 && (
        <div className="ml-[22px] mt-1 space-y-px">
          {findings.map((f, i) => (
            <div key={i} className="flex items-start gap-1.5  text-[10px]">
              <span className="text-tungsten shrink-0">→</span>
              <span className="text-muted">{f}</span>
            </div>
          ))}
        </div>
      )}
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
          className="flex items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-1.5 py-1  text-[10px] text-muted"
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
 * One thought — a run of consecutive reasoning parts rendered as a single
 * collapsible. Auto-opens while streaming so the user sees the chain of
 * thought in real time; collapses to a summary once the thought is complete
 * (next tool call or text part landed after it).
 */
function Thought({ text, streaming }: { text: string; streaming?: boolean }) {
  const trimmed = text.trim()
  if (!trimmed) return null
  // Fixed-height live tail: the box never resizes while streaming, so the
  // chat below it stops jumping. Only the text inside moves.
  const preview = streaming ? trimmed.slice(-320) : ""
  return (
    <details
      className="group my-2.5 overflow-hidden rounded-2xl border border-line/80 bg-ink/50"
      open={streaming}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[11px] text-dim transition-colors hover:text-muted">
        <ChevronRight size={12} aria-hidden className="transition-transform group-open:rotate-90" />
        <span className="">thinking</span>
        {streaming && (
          <span className="ml-auto flex items-center gap-1.5  text-[10px] text-tungsten">
            <span className="live-dot h-1 w-1 rounded-full bg-tungsten" aria-hidden />
            reasoning
          </span>
        )}
      </summary>
      {streaming ? (
        <div className="h-24 overflow-hidden px-2.5 pb-2.5" aria-live="off">
          <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-muted/70 italic">
            {preview}
            <span className="animate-pulse text-tungsten">▌</span>
          </p>
        </div>
      ) : (
        <p className="max-h-56 overflow-y-auto px-2.5 pb-2.5 text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted scroll-thin">
          {trimmed}
        </p>
      )}
    </details>
  )
}

function Bubble({ message, isLast, busy }: { message: UIMessage; isLast: boolean; busy: boolean }) {
  const parts = message.parts as unknown as Part[]
  const isUser = message.role === "user"

  // Render parts in stream order: consecutive reasoning merges into one
  // Thought, consecutive tool calls group into one activity card, and text
  // lands where it happened.
  const nodes: React.ReactNode[] = []
  let thought = ""
  let thoughtStreaming = false
  let toolRun: React.ReactNode[] = []
  const flushThought = (nextIsMore: boolean) => {
    if (thought.trim()) {
      nodes.push(<Thought key={`th${nodes.length}`} text={thought} streaming={thoughtStreaming && nextIsMore} />)
      thought = ""
      thoughtStreaming = false
    }
  }
  const flushTools = () => {
    if (toolRun.length > 0) {
      nodes.push(
        <div key={`tr${nodes.length}`} className="my-2.5 rounded-2xl border border-line/80 bg-ink/50 px-3 py-1">
          {toolRun}
        </div>
      )
      toolRun = []
    }
  }
  parts.forEach((p, i) => {
    const isLastPart = i === parts.length - 1
    if (p.type === "reasoning") {
      if (typeof p.text === "string") {
        thought += p.text
        // Thought is streaming if: this is the last part and the turn is still busy
        thoughtStreaming = isLastPart && busy
      }
      return
    }
    // Flush thought — it's complete if followed by a non-reasoning part
    flushThought(false)
    if (typeof p.type === "string" && p.type.startsWith("tool-")) {
      toolRun.push(<ToolCall key={`tl${i}`} part={p} />)
    } else if (p.type === "text" && typeof p.text === "string" && p.text) {
      flushTools()
      nodes.push(
        isUser ? (
          <p key={`tx${i}`} className="whitespace-pre-wrap text-sm leading-relaxed break-words">
            {String(p.text)}
          </p>
        ) : (
          <Markdown key={`tx${i}`} text={String(p.text)} />
        )
      )
    }
  })
  // If the turn ends on a reasoning block it's still streaming
  flushThought(busy && isLast)
  flushTools()

  return (
    <div className={isUser ? "flex justify-end" : ""}>
      <div className={isUser ? "max-w-[85%] rounded-2xl rounded-br-lg bg-paper px-4 py-2.5 text-ink shadow-[3px_3px_0_rgb(217_72_0/0.35)]" : "w-full min-w-0"}>
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

const THINKING_HINT: Record<ThinkingLevel, string> = {
  off: "No chain of thought — fastest, cheapest",
  low: "Brief reasoning — the default balance",
  high: "Full reasoning — slower, sharper",
}

/**
 * Custom model + thinking picker. Groups free vs paid, marks vision models,
 * and carries a Test-all probe (read-only gateway catalogue check, no spend)
 * plus the thinking-effort segmented control.
 */
function ModelPicker({
  models,
  activeModel,
  thinking,
  live,
  liveBusy,
  open,
  onToggle,
  onClose,
  onPick,
  onThinking,
  onTest,
  disabled,
}: {
  models: ModelOption[]
  activeModel: string
  thinking: ThinkingLevel
  live: LiveModelStatus[] | null
  liveBusy: boolean
  open: boolean
  onToggle: () => void
  onClose: () => void
  onPick: (id: string) => void
  onThinking: (t: ThinkingLevel) => void
  onTest: () => void
  disabled: boolean
}) {
  const active = models.find((m) => m.id === activeModel)
  const liveById = new Map((live ?? []).map((s) => [s.id, s.live]))
  const groups: Array<{ tier: string; title: string; items: ModelOption[] }> = [
    { tier: "auto", title: "Auto", items: models.filter((m) => m.tier === "auto") },
    { tier: "advance", title: "Advance", items: models.filter((m) => m.tier === "advance") },
    { tier: "balanced", title: "Balanced", items: models.filter((m) => m.tier === "balanced") },
    { tier: "free", title: "Free", items: models.filter((m) => m.tier === "free") },
  ].filter((g) => g.items.length > 0)

  const row = (m: ModelOption) => {
    const isActive = m.id === activeModel
    const status = liveById.get(m.id)
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => {
          onPick(m.id)
          onClose()
        }}
        aria-pressed={isActive}
        className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
          isActive ? "bg-tungsten/10" : "hover:bg-white/5"
        }`}
      >
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${isActive ? "text-tungsten" : "text-transparent"}`} aria-hidden>
          <Check size={13} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`truncate text-[12.5px] font-semibold ${isActive ? "text-paper" : "text-muted"}`}>{m.label}</span>
            {status === true ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" title="Serving on the gateway" />
            ) : status === false ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bad" title="Not in the gateway catalogue" />
            ) : null}
          </span>
          <span className="block truncate text-[10.5px] text-dim" title={m.blurb}>{m.blurb}</span>
        </span>
        {!m.textOnly ? (
          <span className="shrink-0 rounded-full bg-panel-3 px-1.5 py-px text-[9px] font-bold text-muted">vision</span>
        ) : null}
      </button>
    )
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label="Model and thinking"
        aria-expanded={open}
        title={active?.blurb ?? "Model — applies to the next message"}
        className="flex h-8 max-w-[150px] items-center gap-1 rounded-full border border-line px-2.5 text-[11px] font-semibold text-muted transition-colors hover:border-dim hover:text-paper focus:border-tungsten disabled:opacity-40"
      >
        <Brain size={12} className="shrink-0 text-tungsten" aria-hidden />
        <span className="truncate">{active?.label ?? "Model"}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-40 cursor-default bg-transparent" />
          <div className="absolute bottom-10 left-0 z-50 w-72 overflow-hidden rounded-2xl border border-line bg-panel-2 shadow-[0_16px_48px_-12px_rgb(0_0_0/0.8)]">
            <div className="scroll-thin max-h-64 overflow-y-auto p-1.5">
              {groups.map((g) => (
                <div key={g.tier}>
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-dim">{g.title}</p>
                  {g.items.map(row)}
                </div>
              ))}
            </div>
            <div className="border-t border-line-soft p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-dim">
                <Brain size={11} aria-hidden /> Thinking
              </p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink p-1" role="group" aria-label="Thinking effort">
                {(["off", "low", "high"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onThinking(t)}
                    aria-pressed={thinking === t}
                    title={THINKING_HINT[t]}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-bold capitalize transition-colors ${
                      thinking === t ? "bg-tungsten text-white" : "text-dim hover:text-paper"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-dim">{THINKING_HINT[thinking]}</p>
              <button
                type="button"
                onClick={onTest}
                disabled={liveBusy}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line px-2 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:border-tungsten hover:text-paper disabled:opacity-50"
              >
                <FlaskConical size={12} aria-hidden />
                {liveBusy ? "Probing gateway…" : live ? "Re-test all models" : "Test all models"}
              </button>
              {live ? (
                <p className="mt-1 text-center text-[10px] text-dim">
                  {live.filter((s) => s.live).length}/{live.length} serving · no spend, catalogue check only
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
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
  // Timestamp of when the current turn started — drives the elapsed timer.
  const [turnStart, setTurnStart] = useState(Date.now())
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

  const [thinking, setThinking] = useState<ThinkingLevel>("low")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [live, setLive] = useState<LiveModelStatus[] | null>(null)
  const [liveBusy, setLiveBusy] = useState(false)

  // Model + thinking live in the Chat Durable Object, so every tab on this
  // session agrees. Applies to the next message sent.
  useEffect(() => {
    let dead = false
    fetchChatModel(sessionId)
      .then((r) => {
        if (dead) return
        setModels(r.available)
        setActiveModel(r.model)
        setThinking(r.thinking)
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

  async function changeThinking(t: ThinkingLevel) {
    if (t === thinking || modelBusy) return
    setModelBusy(true)
    setModelError(null)
    try {
      const r = await setChatThinking(sessionId, t)
      setThinking(r.thinking)
    } catch (err) {
      setModelError(err instanceof Error ? err.message : String(err))
    } finally {
      setModelBusy(false)
    }
  }

  async function testAll() {
    if (liveBusy) return
    setLiveBusy(true)
    try {
      const r = await fetchLiveModels(sessionId)
      setLive(r.status)
    } catch {
      setModelError("live probe failed — gateway unreachable")
    } finally {
      setLiveBusy(false)
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
    // Record when this turn started so the elapsed timer is accurate.
    setTurnStart(Date.now())
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
    <aside className="flex min-h-0 flex-1 flex-col bg-panel/40" aria-label="Conversation">
      {/* Hidden on mobile: the Studio tab bar already says "Direct", and the
          status + New-cut actions live in the Studio header — a third header
          here steals ~65px from the chat. Desktop keeps the full header. */}
      <header className="hidden shrink-0 items-center gap-3 border-b border-line bg-panel/60 px-4 py-3 md:flex">
        <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tungsten text-white">
          <Sparkles size={16} aria-hidden />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-bold text-paper">Director</span>
          <span className={`flex items-center gap-1.5 text-[11px] ${busy ? "text-tungsten" : "text-dim"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${busy ? "live-dot bg-tungsten" : "bg-ok"}`} aria-hidden />
            {busy ? "directing your cut…" : "ready for your brief"}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {modelError ? <span className="text-[10px] text-bad">{modelError}</span> : null}
          <button
            type="button"
            onClick={clearHistory}
            disabled={isStreaming}
            title="Start a new cut"
            aria-label="Start a new cut"
            className="flex h-8 w-8 items-center justify-center rounded-full text-dim transition-colors hover:bg-white/10 hover:text-paper disabled:opacity-40"
          >
            <Plus size={15} aria-hidden />
          </button>
        </span>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 scroll-thin">
        {messages.length === 0 && <EmptyBrief />}
        {messages.map((m, i) => (
          <Bubble key={m.id} message={m} isLast={i === messages.length - 1} busy={busy} />
        ))}
        {busy && <Working messages={messages} startedAt={turnStart} />}
        {status === "error" && !busy && (
          <div className="rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-xs leading-relaxed">
            <p className="font-semibold text-bad">Something broke mid-turn</p>
            <p className="mt-0.5 text-muted">
              {streamError instanceof Error ? streamError.message : streamError ? String(streamError) : "The stream broke — your cut is safe, just retry."}
              {connectionError?.message ? ` (${connectionError.message})` : ""}
            </p>
            <button
              type="button"
              onClick={() => (regenerate ? regenerate() : undefined)}
              className="mt-2 rounded-full bg-bad/20 px-3 py-1 text-[11px] font-semibold text-bad transition-colors hover:bg-bad/30"
            >
              Retry
            </button>
          </div>
        )}
        {stalled && !busy && (
          <div className="rounded-2xl border border-line bg-panel px-4 py-3 text-xs leading-relaxed text-muted">
            The director went quiet. Your work is saved — send again to retry.
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-xs text-bad">{error}</div>
        )}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => {
            stickToBottom.current = true
            setAtBottom(true)
            scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
          }}
          className="mx-auto -mt-9 mb-1 flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel-2/95 px-3 py-1  text-[10px] text-muted shadow-lg backdrop-blur transition-colors hover:border-tungsten hover:text-paper"
        >
          ↓ latest
        </button>
      )}

      {pending.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-1 pt-2">
          {pending.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-tungsten/40 bg-tungsten/10 py-1 pl-3 pr-2  text-[10px] text-tungsten hover:border-bad hover:text-bad"
              aria-label={`Remove ${f.name}`}
              title="Remove attachment"
            >
              <span className="truncate">{f.name}</span> <X size={11} aria-hidden />
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="shrink-0 p-3">
        <div className="rounded-3xl border border-line bg-panel-2 shadow-[0_8px_32px_-12px_rgb(0_0_0/0.8)] transition-colors focus-within:border-tungsten/60">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={onPick}
            className="hidden"
            aria-label="Attach reference"
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(e)
              }
            }}
            rows={2}
            disabled={busy}
            placeholder={busy ? "Directing your cut…" : "Tell the director what to change…"}
            aria-label="Message"
            className="max-h-36 min-h-12 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-sm leading-relaxed text-paper outline-none placeholder:text-dim disabled:opacity-50"
          />
          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              title="Attach a reference image or PDF"
              aria-label="Attach a reference image or PDF"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-dim transition-colors hover:bg-white/10 hover:text-paper disabled:opacity-40"
            >
              <Plus size={16} aria-hidden />
            </button>
            {models.length > 0 ? (
              <ModelPicker
                models={models}
                activeModel={activeModel}
                thinking={thinking}
                live={live}
                liveBusy={liveBusy}
                open={pickerOpen}
                onToggle={() => setPickerOpen((v) => !v)}
                onClose={() => setPickerOpen(false)}
                onPick={(id) => void changeModel(id)}
                onThinking={(t) => void changeThinking(t)}
                onTest={() => void testAll()}
                disabled={busy || modelBusy}
              />
            ) : null}
            {pending.length > 0 ? (
              <span className=" text-[10px] text-tungsten">{pending.length} attached</span>
            ) : (
              <span className="hidden  text-[10px] text-dim sm:inline">Enter to send · Shift+Enter for a new line</span>
            )}
            {busy ? (
              <button
                type="button"
                onClick={stop}
                title="Stop directing"
                aria-label="Stop directing"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-bad text-ink transition-transform hover:scale-105"
              >
                <Square size={13} fill="currentColor" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim() && pending.length === 0}
                title="Send"
                aria-label="Send"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink transition-all hover:scale-105 hover:bg-tungsten hover:text-white disabled:cursor-not-allowed disabled:bg-panel-3 disabled:text-dim"
              >
                <ArrowUp size={16} strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </form>
    </aside>
  )
}

function EmptyBrief() {
  const fill = (text: string) => {
    window.dispatchEvent(new CustomEvent("motion:suggest", { detail: text }))
  }
  return (
    <div className="pt-2">
      <div className="rounded-xl border border-tungsten/25 bg-tungsten/[0.06] p-3.5">
        <p className="text-[13px] font-semibold text-paper">Start with one sentence</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Say the subject, length and mood. The director handles casting, pacing,
          music and timing — ask for the tweak, not the keyframe.
        </p>
      </div>
      <p className="eyebrow mt-5 mb-2">tap to try</p>
      <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted">
        {[
          "A 5s product reveal with the logo punching in on an overshoot",
          "Kinetic type that masks a headline in per character",
          "A lower third that wipes in under a talking head",
        ].map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => fill(s)}
              className="flex w-full gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-left transition-all hover:border-tungsten/50 hover:text-paper"
            >
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-tungsten/70" />
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Live working indicator. Shows:
 * - which tool is currently running (last in-flight tool call)
 * - elapsed seconds (counts up every second; reveals pacing at a glance)
 * - total tool calls so far this turn
 *
 * Because the 5 rpm gateway limit means ~12s between calls, the elapsed
 * counter makes waiting feel intentional rather than broken.
 */
function Working({ messages, startedAt }: { messages: UIMessage[]; startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(t)
  }, [startedAt])

  // Find the last pending tool call across all messages
  const currentTool = useMemo(() => {
    let last: string | null = null
    for (const m of messages) {
      for (const p of (m.parts ?? []) as Part[]) {
        const t = String(p.type ?? "")
        if (t.startsWith("tool-")) {
          const state = String(p.state ?? "")
          if (state !== "output-available" && state !== "output-error") {
            last = toolName(p)
          }
        }
      }
    }
    return last
  }, [messages])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-tungsten/30 bg-tungsten/[0.07] px-4 py-2.5">
      <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-tungsten" aria-hidden="true" />
      <span className="truncate text-xs font-semibold text-paper">
        {currentTool ? `Running ${currentTool}…` : "Directing…"}
      </span>
      <span className="ml-auto shrink-0  text-[11px] tabular-nums text-tungsten">{timeStr}</span>
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
