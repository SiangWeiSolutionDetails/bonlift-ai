import type { ReactNode } from "react"
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu"

export function MenuBand({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <DropdownMenuLabel className="flex items-center gap-2 border-y border-border bg-muted px-3 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {aside}
    </DropdownMenuLabel>
  )
}
