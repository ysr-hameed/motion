import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowUp,
  Check,
  Circle,
  Loader2,
  Mic,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ChatMsg, ClipSpec } from "@/lib/motion"
import { liveStatus } from "@/lib/stages"
import { formatBytes, type Attachment } from "@/lib/attachments"
import { useVoiceInput } from "@/lib/use-voice-input"
import type { Phase, RunProgress } from "@/lib/use-motion-studio"
import type { Artifact } from "@/lib/artifact"

interface ChatRefineCardProps {
  thread: ChatMsg[]
  versions: number
  activeVersion: number
  pending: boolean
  spec: ClipSpec | null
  refineValue: string
  copied: boolean
  onRefineChange: (v: string) => void
  onRefine: (text?: string) => void
  /** Cancels the in-flight run. Rendered as Stop while pending. */
  onStop?: () => void
  /** Retries the last failed run. Shown inline on error bubbles. */
  onRetry?: () => void
  /** Resets typewriter + scroll state when the project changes. */
  resetKey?: number | string | null
  onCopy: () => void
  framed?: boolean
  footer?: boolean
  attachments?: Attachment[]
  onAttachFiles?: (files: FileList) => void
  onRemoveAttachment?: (id: string) => void
  phase?: Phase
  /** Live progress — one line, never a checklist. */
  progress?: RunProgress | null
  /** The cut on screen, for the empty-state copy. */
  artifact?: Artifact | null
}

/**
 * Plain-text lite renderer: paragraphs + bullet lists.
 * The model writes plain sentences with "• / -" lists (see planMessage),
 * so render those as a real <ul> instead of a wall of text. No markdown
 * dependency, no code fences leaked into chat.
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
 * A question the assistant put to the user, with its own options.
 *
 * Options are chosen by the assistant, not by this component — it is the
 * only one who knows which choices would have changed the cut. The user
 * taps one, hits send, or opens Custom and types their own. The question
 * never blocks anything: the cut was already composed.
 */
function QuestionBlock({
  question,
  disabled,
  onSend,
}: {
  question: { text: string; options: string[] }
  disabled: boolean
  onSend: (text: string) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [custom, setCustom] = useState(false)
  const [draft, setDraft] = useState("")

  // A new question (different text) resets local pick state.
  // eslint-disable-next-line react(set-state-in-effect) -- intentional reset on new question
  useEffect(() => {
    setPicked(null)
    setCustom(false)
    setDraft("")
  }, [question.text])

  const canSend = !disabled && (!!picked || !!draft.trim())

  const submit = () => {
    if (disabled) return
    const text = draft.trim() || picked
    if (!text) return
    onSend(text)
    setPicked(null)
    setDraft("")
    setCustom(false)
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/20 p-2.5">
      <p className="px-0.5 text-[12px] font-medium leading-snug">{question.text}</p>
      <div className="flex flex-wrap gap-1.5">
        {question.options.map((o) => {
          const on = picked === o
          return (
            <button
              key={o}
              type="button"
              disabled={disabled || custom}
              aria-pressed={on}
              onClick={() => setPicked(on ? null : o)}
              className={cn(
                "flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-[11px] font-medium break-words transition-colors disabled:opacity-50",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary/60 hover:bg-accent"
              )}
            >
              {on && <Check className="size-3 shrink-0" />}
              <span className="min-w-0">{o}</span>
            </button>
          )
        })}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={custom}
          onClick={() => {
            setCustom((v) => !v)
            setPicked(null)
          }}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
            custom
              ? "border-primary bg-primary text-primary-foreground"
              : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-foreground hover:text-foreground"
          )}
        >
          {custom ? <X className="size-3" /> : <Circle className="size-2 fill-current" />}
          {custom ? "Cancel" : "Custom"}
        </button>
      </div>

      {custom && (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          aria-label="Your answer"
          placeholder="Type your answer…"
          className="w-full resize-none rounded-xl border bg-background px-2.5 py-1.5 text-[12px] outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!canSend}
          onClick={submit}
          className="h-7 gap-1 rounded-full px-3 text-[11px]"
        >
          Send
          <ArrowUp className="size-3" />
        </Button>
      </div>
    </div>
  )
}

/** Conversational follow-ups. Tapping one drops it in the composer. */
function OfferChips({
  offers,
  onPick,
}: {
  offers: string[]
  onPick: (text: string) => void
}) {
  if (offers.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {offers.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] font-medium break-words transition-colors hover:border-primary/60 hover:bg-primary/10"
        >
          <Sparkles className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0">{o}</span>
        </button>
      ))}
    </div>
  )
}

/** Respects the OS "reduce motion" setting for the looping card. */
function useReducedMotionPref(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return reduced
}

/**
 * The in-chat waiting animation.
 *
 * A spinner tells you nothing about how long this will take, and on the
 * free tier the first token can be 30 seconds out — long enough that a
 * static frame reads as a hang. So this shows motion instead of a dot:
 * a small looping title card over a scrubbing timeline, which is
 * literally what the product makes. It is a custom animated element
 * rather than an icon for the same reason — it is the only honest
 * way to say "working, and here is roughly how this run is shaped".
 */
function ThinkingStage({
  progress,
  reduced,
}: {
  progress: RunProgress | null | undefined
  reduced: boolean
}) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - t0) / 1000)),
      1000
    )
    return () => clearInterval(t)
  }, [])

  const line = liveStatus(progress)
  const pct = line?.pct ?? 4

  return (
    <div
      className="flex max-w-[85%] flex-col gap-1.5 px-1 py-1"
      aria-live="polite"
    >
      <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950">
        {/* the looping card */}
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          <div aria-hidden className="absolute inset-0 bg-grid-dark" />
          {!reduced && (
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-1/2"
              style={{
                background:
                  "linear-gradient(0deg, color-mix(in oklab, var(--primary) 22%, transparent), transparent)",
              }}
            />
          )}

          {/* rising bars — a nod to what it is building */}
          <div className="absolute inset-0 flex items-end justify-center gap-2 pb-7">
            {[0.55, 0.85, 0.35, 1].map((h, i) => (
              <span
                key={i}
                className="w-5 rounded-t-sm bg-primary"
                style={
                  reduced
                    ? { height: `${h * 40}%`, opacity: 0.45 }
                    : {
                        height: `${h * 40}%`,
                        opacity: 0.5,
                        animation: `slab ${1.6 + i * 0.22}s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.12}s infinite alternate`,
                      }
                }
              />
            ))}
          </div>

          {/* sweeping playhead */}
          {!reduced && (
            <span
              aria-hidden
              className="absolute bottom-0 top-0 w-px bg-white/70"
              style={{ animation: "sweep 2.4s linear infinite" }}
            />
          )}

          <div className="absolute inset-x-0 bottom-0 flex h-6 items-center gap-[3px] border-t border-white/10 bg-black/40 px-2">
            {Array.from({ length: 18 }, (_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full bg-white/15"
                style={
                  reduced
                    ? undefined
                    : {
                        animation: `tick 1.8s ease-in-out ${i * 0.07}s infinite`,
                      }
                }
              />
            ))}
          </div>
        </div>

        {/* the honest one-liner */}
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2 text-[12px] text-muted-foreground">
          <Loader2 className="size-3 shrink-0 animate-spin" />
          <span>{line?.text ?? "Waiting for the model"}</span>
          {line?.detail ? <span>{line.detail}</span> : null}
          <span className="tabular-nums">· {elapsed}s</span>
        </div>
        <div className="h-px w-full bg-white/10">
          <div
            className="h-px bg-primary/70 transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <style>{`@keyframes slab{from{transform:scaleY(0.25);opacity:.25}to{transform:scaleY(1);opacity:.75}}
@keyframes sweep{from{left:0}to{left:100%}}
@keyframes tick{0%,100%{background-color:rgb(255 255 255 / 0.12);transform:scaleY(1)}50%{background-color:rgb(255 255 255 / 0.5);transform:scaleY(2.4)}}`}</style>
    </div>
  )
}

function TypeText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [n, setN] = useState(0)
  const done = n >= text.length
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  useEffect(() => {
    if (done) {
      onDoneRef.current?.()
      return
    }
    const t = setTimeout(() => setN((v) => Math.min(text.length, v + 2)), 12)
    return () => clearTimeout(t)
  }, [n, done, text.length, text])
  if (text === "") return null
  return (
    <span onClick={() => setN(text.length)} className="cursor-text">
      <RichText text={text.slice(0, n)} />
      {!done && (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-primary" />
      )}
    </span>
  )
}

const PLACEHOLDER: Record<Phase, string> = {
  idle: "Describe your clip to begin…",
  thinking: "Working… press Stop to interrupt",
  generating: "Working… press Stop to interrupt",
  ready: "Ask for a change… (Enter sends, Shift+Enter for a new line)",
}

/**
 * The conversation.
 *
 * What the user sees is the assistant talking: a streamed message, an
 * optional question with the assistant's own options, and an optional
 * follow-up it wants to take up. Nothing else.
 *
 * What they do not see: the composition's source, the pipeline's stage
 * names, a build log, or the critic's internal notes. The design is on
 * the stage next to this, playing — that is the artefact, and a wall of
 * telemetry above it is noise that makes the work look unfinished.
 */
export function ChatRefineCard({
  thread,
  activeVersion,
  pending,
  spec,
  refineValue,
  copied,
  onRefineChange,
  onRefine,
  onStop,
  onRetry,
  resetKey,
  onCopy,
  framed = true,
  footer = true,
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
  phase = "ready",
  progress = null,
  artifact = null,
}: ChatRefineCardProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const reduced = useReducedMotionPref()

  // Stick to bottom only when the user is already there — reading history
  // must never be yanked away by a new token.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  useEffect(() => {
    if (!stickRef.current) return
    if (reduced) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [thread.length, pending, reduced])

  const voice = useVoiceInput((text) =>
    onRefineChange(refineValue ? `${refineValue} ${text}` : text)
  )

  /**
   * Which messages have finished writing themselves in.
   *
   * A message that arrives after mount streams; anything already on screen
   * when the thread mounted renders whole, so reopening a project does
   * not re-type its history. Reset per project via resetKey (and the
   * parent's key={projectId} remount as a second guard).
   */
  const [typed, setTyped] = useState<Set<number>>(
    () => new Set(thread.map((m) => m.id))
  )
  useEffect(() => {
    setTyped(new Set(thread.map((m) => m.id)))
    stickRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])
  // Reduced motion: never type, render everything whole.
  useEffect(() => {
    if (reduced) setTyped(new Set(thread.map((m) => m.id)))
  }, [reduced, thread])
  const markTyped = useCallback((id: number) => {
    setTyped((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])

  const pick = (text: string) => {
    onRefineChange(text)
    inputRef.current?.focus()
  }

  const sendNow = (text: string) => {
    // Pass the text through directly. Setting it in the composer first and
    // then calling onRefine() read state React had not committed yet, so
    // the option button sent the previous draft instead of itself.
    onRefineChange(text)
    onRefine(text)
  }

  const autosize = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }
  useEffect(autosize, [refineValue])

  const submitComposer = () => {
    // Enter mid-run must NOT kill the run — only the Stop button does.
    if (pending) return
    onRefine()
  }

  const lastErrorId =
    thread.length > 0 && thread[thread.length - 1]?.tone === "error"
      ? thread[thread.length - 1]!.id
      : null

  return (
    <div
      className={
        framed
          ? "w-full overflow-hidden rounded-2xl border bg-background shadow-xl shadow-black/5"
          : "flex h-full min-h-0 w-full flex-1 flex-col"
      }
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-[13px] font-semibold tracking-[-0.01em]">SlyxUp</span>
        <div className="flex-1" />
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className={
          framed
            ? "flex max-h-72 flex-col gap-2.5 overflow-x-hidden overflow-y-auto scrollbar-chat px-4 py-4 text-left"
            : "flex min-h-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto scrollbar-chat px-4 py-4 text-left"
        }
      >
        {thread.length === 0 && !pending && (
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed px-6 py-8 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
              <Sparkles className="size-4 text-muted-foreground" />
            </span>
            <p className="text-[13px] font-semibold">No messages yet</p>
            <p className="max-w-xs text-[12px] text-muted-foreground">
              {artifact
                ? "Ask for a change below — each one saves as a new version."
                : "Describe the clip below and I’ll compose the first cut."}
            </p>
          </div>
        )}
        {thread.map((m, i) =>
          m.role === "user" ? (
            <div
              key={m.id}
              className="max-w-[85%] self-end break-words rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-[13px] text-primary-foreground"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={m.id}
              className={cn(
                "flex min-w-0 max-w-full flex-col",
                i > 0 && thread[i - 1]?.role === "ai" && "-mt-1"
              )}
            >
              {m.kind === "plan" ? (
                <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                    Plan
                  </p>
                  <div className="break-words">
                    {typed.has(m.id) || reduced ? (
                      <RichText text={m.text} />
                    ) : (
                      <TypeText key={m.id} text={m.text} onDone={() => markTyped(m.id)} />
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "break-words text-[13px] leading-relaxed",
                    m.tone === "error" &&
                      "rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2"
                  )}
                >
                  {m.text ? (
                    typed.has(m.id) || reduced ? (
                      <RichText text={m.text} />
                    ) : (
                      <TypeText key={m.id} text={m.text} onDone={() => markTyped(m.id)} />
                    )
                  ) : null}
                  {m.tone === "error" && m.id === lastErrorId && !pending && onRetry && (
                    <div className="mt-2 flex justify-start">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onRetry}
                        className="h-7 gap-1.5 rounded-full px-3 text-[11px]"
                      >
                        <RotateCcw className="size-3" />
                        Retry
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {m.offers && m.offers.length > 0 && (
                <OfferChips offers={m.offers} onPick={pick} />
              )}
              {m.question && (
                <QuestionBlock
                  question={m.question}
                  disabled={pending}
                  onSend={sendNow}
                />
              )}
            </div>
          )
        )}
        {pending && <ThinkingStage progress={progress} reduced={reduced} />}
        <div ref={bottomRef} />
      </div>

      <div className={`px-4 ${footer ? "pb-2.5" : "pb-4"}`}>
        <div className="rounded-2xl border bg-card shadow-sm transition-colors focus-within:border-primary/50 focus-within:shadow-[0_0_24px_-12px_var(--color-primary)]">
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
            value={refineValue}
            onChange={(e) => onRefineChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submitComposer()
              }
            }}
            rows={1}
            placeholder={PLACEHOLDER[phase] ?? PLACEHOLDER.ready}
            aria-label="Ask for a change"
            className="max-h-[120px] w-full min-w-0 resize-none bg-transparent px-3.5 pb-1 pt-2.5 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-0.5 px-2 pb-2">
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
            {voice.supported && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                aria-label={voice.listening ? "Stop dictation" : "Voice input"}
                onClick={voice.toggle}
              >
                <Mic
                  className={cn(
                    "size-3.5",
                    voice.listening && "text-destructive"
                  )}
                />
              </Button>
            )}
            <div className="flex-1" />
            <Button
              size="icon"
              aria-label={pending ? "Stop generation" : "Send message"}
              title={pending ? "Stop generation" : "Send message (Enter)"}
              disabled={pending ? !onStop : !refineValue.trim()}
              onClick={pending ? onStop : () => onRefine()}
              className={cn(
                "size-8 shrink-0 rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 disabled:shadow-none",
                pending &&
                  "bg-destructive text-destructive-foreground shadow-destructive/25 hover:bg-destructive/90"
              )}
            >
              {pending ? (
                <Square className="size-3.5" />
              ) : (
                <Send className="size-3.5" />
              )}
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
        {!pending && (
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/70">
            Enter sends · Shift+Enter for a new line
          </p>
        )}
      </div>

      {footer && (artifact || spec) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t px-4 py-3">
          <span className="text-[11px] text-muted-foreground">
            {spec ? `${spec.format} · v${activeVersion}` : `v${activeVersion}`}
          </span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" disabled={!spec} onClick={onCopy}>
            {copied ? <Check /> : <Paperclip />}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
      )}
    </div>
  )
}
