import { useEffect, useRef, useState } from "react"
import { ChevronDown, Download, Film } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ExportSettings } from "@/lib/use-motion-studio"
import { cn } from "@/lib/utils"

const QUALITIES: ExportSettings["quality"][] = ["720p", "1080p", "4K"]
const RATES: ExportSettings["fps"][] = [24, 30, 60]
const CONTAINERS: ExportSettings["container"][] = ["MP4", "WebM"]

function Row<T extends string | number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: T[]
  value: T
  onPick: (v: T) => void
}) {
  return (
    <div>
      <p id={`export-${label.replace(/\s+/g, "-").toLowerCase()}`} className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex gap-1.5" role="radiogroup" aria-labelledby={`export-${label.replace(/\s+/g, "-").toLowerCase()}`}>
        {options.map((o) => {
          const selected = o === value
          return (
            <button
              key={String(o)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPick(o)}
              className={cn(
                "min-h-[44px] flex-1 rounded-full px-2 py-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
              )}
            >
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Export settings dropdown — quality, frame rate and container are
 * stored on the project. "Render video" captures the preview canvas
 * to a real video file.
 */
export function ExportMenu({
  settings,
  onChange,
  onExportVideo,
  disabled,
}: {
  settings: ExportSettings
  onChange: (patch: Partial<ExportSettings>) => void
  onExportVideo: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div className="relative">
      <Button
        ref={triggerRef as React.Ref<HTMLButtonElement>}
        size="sm"
        disabled={disabled}
        title={disabled ? "Render a version first, then export" : "Export settings"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={disabled ? "Export (render a version first)" : "Export settings"}
        className="min-h-[36px]"
      >
        <Download />
        <span className="hidden min-[480px]:inline">Export</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </Button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close export settings"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div role="dialog" aria-label="Export settings" className="absolute right-0 z-50 mt-2 flex w-64 flex-col gap-4 rounded-2xl border bg-popover p-4 shadow-xl overscroll-contain">
            <Row
              label="Quality"
              options={QUALITIES}
              value={settings.quality}
              onPick={(quality) => onChange({ quality })}
            />
            <Row
              label="Frame rate"
              options={RATES}
              value={settings.fps}
              onPick={(fps) => onChange({ fps })}
            />
            <Row
              label="Container"
              options={CONTAINERS}
              value={settings.container}
              onPick={(container) => onChange({ container })}
            />
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                onExportVideo()
                setOpen(false)
              }}
            >
              <Film />
              Render video
            </Button>
            <p className="-mt-2 text-[11px] leading-snug text-muted-foreground">
              Renders in this tab at your chosen frame rate. WebM
              keeps transparency for overlays; MP4 flattens to the
              background color.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
