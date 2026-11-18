import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout } from "@/features/auth/api"
import { useCurrentUser } from "@/features/auth/queries"
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher"
import { getErrorMessage } from "@/lib/error-message"
import { ChevronDownIcon, LogOutIcon } from "lucide-react"

function useLogOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()

  return async () => {
    try {
      await logout()
    } catch (error) {
      toast.error(getErrorMessage(error, t))
      return
    }
    queryClient.clear()
    await navigate({ to: "/login" })
  }
}

export function NavUser() {
  const { t } = useTranslation("auth")
  const user = useCurrentUser()
  const logOut = useLogOut()
  const name = user.displayName ?? user.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-48">
          <span className="truncate">{name}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="grid font-normal leading-tight">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <WorkspaceSwitcher />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logOut()}>
          <LogOutIcon />
          {t("logOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
