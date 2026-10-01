import { Badge } from "@/components/ui/badge"

interface SectionHeadingProps {
  eyebrow: string
  title: string
  sub?: string
}

export function SectionHeading({ eyebrow, title, sub }: SectionHeadingProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
      <Badge variant="secondary" className="ring-gradient">{eyebrow}</Badge>
      <h2 className="bg-linear-to-b from-foreground to-foreground/75 bg-clip-text text-2xl text-transparent sm:text-3xl">{title}</h2>
      {sub && (
        <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          {sub}
        </p>
      )}
    </div>
  )
}
