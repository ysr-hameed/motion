import { useEffect, useRef, useState } from "react"
import {
  ArrowUp,
  Mic,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DEFAULT_DURATION, DURATIONS, FORMATS, PROMPT_EXAMPLES } from "@/lib/motion"
import { formatBytes, type Attachment } from "@/lib/attachments"
import { useVoiceInput } from "@/lib/use-voice-input"
import { cn } from "@/lib/utils"

function formatIcon(format: string): LucideIcon {
  if (format.includes("9:16")) return RectangleVertical
  if (format.includes("1:1")) return Square
  return RectangleHorizontal
}

interface PromptBoxProps {
  id?: string
  onGenerate: (prompt: string, format: string, secs: number) => void
  examples?: string[]
  formats?: string[]
  placeholder?: string
  showHint?: boolean
  autoFocus?: boolean
  attachments?: Attachment[]
  onAttachFiles?: (files: FileList) => void
  onRemoveAttachment?: (id: string) => void
}

/**
 * Shared prompt composer — one input that starts every video.
 * Used on the landing page and in Projects. Submitting opens the
 * editor, where the first version is rendered.
 */
export function PromptBox({
  id,
  onGenerate,
  examples = PROMPT_EXAMPLES,
  formats = FORMATS,
  placeholder = "Describe the clip you want to make…",
  showHint: _showHint = true,
  autoFocus = false,
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
}: PromptBoxProps) {
  const [value, setValue] = useState("")
  const [format, setFormat] = useState(formats[0] ?? FORMATS[0]!)
  const [secs, setSecs] = useState<number>(DEFAULT_DURATION)
  const [focused, setFocused] = useState(false)
  const [typed, setTyped] = useState("")
  const [typingPaused, setTypingPaused] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const voice = useVoiceInput((text) =>
    setValue((v) => (v ? `${v} ${text}` : text))
  )

  const autosize = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  useEffect(autosize, [value])

  // Placeholder visibility is DERIVED, so the typewriter effect never has to
  // clear the animated text with a synchronous setState — that pattern
  // cascaded an extra render pass and flashed stale text on every toggle.
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const showTyping =
    !value && !focused && !typingPaused && !reducedMotion && examples.length > 0

  useEffect(() => {
    if (!showTyping) return
    let word = 0
    let char = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const current = examples[word]
      if (!deleting) {
        char += 1
        setTyped(current.slice(0, char))
        if (char === current.length) {
          deleting = true
          timer = setTimeout(tick, 1500)
          return
        }
        timer = setTimeout(tick, 45)
      } else {
        char -= 1
        setTyped(current.slice(0, char))
        if (char === 0) {
          deleting = false
          word = (word + 1) % examples.length
          // Blank between examples so a resumed cycle never shows the
          // previous word while it waits out the 400ms gap.
          setTyped("")
          timer = setTimeout(tick, 400)
          return
        }
        timer = setTimeout(tick, 20)
      }
    }
    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
  }, [showTyping, examples])

  const canSubmit = value.trim().length > 0

  const submit = () => {
    const prompt = value.trim()
    if (!prompt) return
    onGenerate(prompt, format, secs)
    setValue("")
  }

  return (
    <div id={id} className="w-full scroll-mt-24">
      <div
        className={cn(
          // Elevation lifts on focus so the composer visibly "activates" —
          // it's the primary action on both the landing page and the studio.
          "rounded-2xl border bg-card transition-all duration-300 [transition-timing-function:var(--ease-out-soft)]",
          focused
            ? "border-primary/50 shadow-elev-3 ring-2 ring-primary/15"
            : "border-border shadow-elev-1 hover:border-muted-foreground/30 hover:shadow-elev-2"
        )}
      >
        <div className="relative">
          <label htmlFor={id ? `${id}-input` : undefined} className="sr-only">
            Describe your clip
          </label>
          <textarea
            ref={taRef}
            id={id ? `${id}-input` : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={2}
            autoFocus={autoFocus}
            placeholder={showTyping ? "" : placeholder}
            aria-label="Describe your clip"
            aria-describedby={id ? `${id}-hint` : undefined}
            className="max-h-40 w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground sm:text-[15px]"
          />
          {showTyping && (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-4 pb-1 pt-3.5">
              <div
                aria-hidden
                className="text-left text-base text-muted-foreground sm:text-[15px]"
              >
                {typed}
                <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-primary" />
              </div>
              <button
                type="button"
                onClick={() => setTypingPaused(true)}
                aria-label="Pause example animations"
                title="Pause examples"
                className="pointer-events-auto ml-2 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Pause
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-lg border bg-background py-0.5 pl-0.5 pr-1.5"
                >
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    className="size-8 rounded-md object-cover"
                  />
                  <span className="max-w-32">
                    <span className="block truncate text-[11px] font-medium">
                      {a.name}
                    </span>
                    <span className="block text-[10px] tabular-nums text-muted-foreground">
                      {formatBytes(a.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment?.(a.id)}
                    aria-label={`Remove ${a.name}`}
                    className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

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
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-3 pb-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Attach reference image (PNG or JPG, up to 4)"
              title="Attach reference image"
              onClick={() => fileRef.current?.click()}
            >
              <Plus />
            </Button>
            {voice.supported && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-9",
                  voice.listening && "bg-destructive/10 text-destructive"
                )}
                aria-label={voice.listening ? "Stop dictation" : "Dictate with voice"}
                title={voice.listening ? "Stop dictation" : "Dictate with voice"}
                aria-pressed={voice.listening}
                onClick={voice.toggle}
              >
                <Mic />
              </Button>
            )}
            <div className="mx-1 hidden h-4 w-px bg-border min-[480px]:block" />
            <div
              className="flex flex-wrap gap-1"
              role="radiogroup"
              aria-label="Aspect ratio"
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
                e.preventDefault()
                const i = formats.indexOf(format)
                const n = e.key === "ArrowRight" ? (i + 1) % formats.length : (i - 1 + formats.length) % formats.length
                setFormat(formats[n]!)
              }}
            >
              {formats.map((f) => {
                const Icon = formatIcon(f)
                const selected = format === f
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    title={`${f} aspect ratio`}
                    onClick={() => setFormat(f)}
                    className={cn(
                      "flex min-h-[36px] items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3" aria-hidden />
                    {f}
                  </button>
                )
              })}
            </div>
            <div className="mx-1 hidden h-4 w-px bg-border min-[480px]:block" />
            <div
              className="flex flex-wrap gap-1"
              role="radiogroup"
              aria-label="Clip length in seconds"
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
                e.preventDefault()
                const i = DURATIONS.findIndex((d) => d === secs)
                const n = e.key === "ArrowRight" ? (i + 1) % DURATIONS.length : (i - 1 + DURATIONS.length) % DURATIONS.length
                const next = DURATIONS[n]
                if (next !== undefined) setSecs(next)
              }}
            >
              {DURATIONS.map((n) => {
                const selected = secs === n
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    title={`${n} seconds`}
                    onClick={() => setSecs(n)}
                    className={cn(
                      "min-h-[36px] rounded-md px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {n}s
                  </button>
                )
              })}
            </div>
            <div className="min-w-2 flex-1" />
            <Button
              type="button"
              aria-label={canSubmit ? "Create clip from description" : "Type a description to create a clip"}
              title={canSubmit ? "Create clip" : "Describe your clip first"}
              disabled={!canSubmit}
              onClick={submit}
              className="h-9 justify-center gap-1.5 px-4 max-sm:w-full"
            >
              <ArrowUp className="size-4" aria-hidden />
              <span>Create clip</span>
            </Button>
          </div>
        </div>
      </div>

      <p id={id ? `${id}-hint` : undefined} className="mt-2 text-center text-xs text-muted-foreground">
        Enter to create · Shift + Enter for a new line · Opens in the editor
      </p>
    </div>
  )
}
