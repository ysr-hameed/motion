import { Badge } from "@/components/ui/badge"

interface SectionHeadingProps {
  eyebrow: string
  title: string
  sub?: string
}

export function SectionHeading({ eyebrow, title, sub }: SectionHeadingProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
      <Badge variant="secondary">{eyebrow}</Badge>
      <h2 className="text-2xl sm:text-3xl">{title}</h2>
      {sub && (
        <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          {sub}
        </p>
      )}
    </div>
  )
}
