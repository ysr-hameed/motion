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
  showHint = true,
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

  useEffect(() => {
    if (
      value ||
      focused ||
      examples.length === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTyped("")
      return
    }
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
          timer = setTimeout(tick, 400)
          return
        }
        timer = setTimeout(tick, 20)
      }
    }
    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
  }, [value, focused, examples])

  const showTyping = !value && !focused && examples.length > 0
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
          "rounded-2xl border bg-card shadow-sm transition-all",
          focused
            ? "border-primary/50 ring-2 ring-primary/15"
            : "border-border hover:border-muted-foreground/30"
        )}
      >
        <div className="relative">
          <textarea
            ref={taRef}
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
            className="max-h-40 w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground sm:text-[15px]"
          />
          {showTyping && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 px-4 pb-1 pt-3.5 text-left text-base text-muted-foreground sm:text-[15px]"
            >
              {typed}
              <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-primary" />
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
              className="size-8"
              aria-label="Attach reference image"
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
                  "size-8",
                  voice.listening && "bg-destructive/10 text-destructive"
                )}
                aria-label={voice.listening ? "Stop dictation" : "Voice input"}
                onClick={voice.toggle}
              >
                <Mic />
              </Button>
            )}
            <div className="mx-1 hidden h-4 w-px bg-border min-[480px]:block" />
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Aspect ratio">
              {formats.map((f) => {
                const Icon = formatIcon(f)
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={format === f}
                    title={`${f} aspect ratio`}
                    onClick={() => setFormat(f)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-colors",
                      format === f
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3" />
                    {f}
                  </button>
                )
              })}
            </div>
            <div className="mx-1 hidden h-4 w-px bg-border min-[480px]:block" />
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Clip length">
              {DURATIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={secs === n}
                  title={`${n} seconds`}
                  onClick={() => setSecs(n)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-colors",
                    secs === n
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {n}s
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <Button
              type="button"
              aria-label="Create clip"
              disabled={!canSubmit}
              onClick={submit}
              className="h-8 gap-1.5 px-3.5"
            >
              <ArrowUp className="size-4" />
              <span className="hidden sm:inline">Create</span>
            </Button>
          </div>
        </div>
      </div>

      {showHint && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Enter to create · Shift + Enter for a new line · Opens in the editor
        </p>
      )}
    </div>
  )
}
