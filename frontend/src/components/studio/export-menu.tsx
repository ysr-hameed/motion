import { useState } from "react"
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
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex gap-1.5">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            onClick={() => onPick(o)}
            className={cn(
              "flex-1 rounded-full px-2 py-1.5 text-xs font-medium tabular-nums transition-colors",
              o === value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            )}
          >
            {o}
          </button>
        ))}
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

  return (
    <div className="relative">
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Export settings"
      >
        <Download />
        <span className="hidden min-[480px]:inline">Export</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-50 mt-2 flex w-64 flex-col gap-4 rounded-2xl border bg-popover p-4 shadow-xl">
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
              Encoded in this tab by Remotion at your chosen frame rate. WebM
              keeps a transparent background; MP4 flattens it to the
              composition's own background.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
