import { Badge } from "@/components/ui/badge"

interface SectionHeadingProps {
  eyebrow: string
  title: string
  sub?: string
}

export function SectionHeading({ eyebrow, title, sub }: SectionHeadingProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
      <Badge variant="secondary">{eyebrow}</Badge>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="text-muted-foreground">{sub}</p>}
    </div>
  )
}
