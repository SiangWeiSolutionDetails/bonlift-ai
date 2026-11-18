import { CircleCheckIcon } from "lucide-react"

export function CurrentMark({ current }: { current: boolean }) {
  if (!current) return <span className="size-4 shrink-0" aria-hidden />
  return <CircleCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
}
