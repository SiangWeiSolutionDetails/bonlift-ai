import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout, signInHref } from "@/features/auth/api"
import { useCurrentUser } from "@/features/auth/queries"
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher"
import { getErrorMessage } from "@/lib/error-message"
import { ChevronDownIcon } from "lucide-react"

function useEndSession() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return async () => {
    try {
      await logout()
    } catch (error) {
      toast.error(getErrorMessage(error, t))
      return false
    }
    queryClient.clear()
    return true
  }
}

function useLogOut() {
  const endSession = useEndSession()
  const navigate = useNavigate()
  return async () => {
    if (await endSession()) await navigate({ to: "/login" })
  }
}

function useSwitchAccount() {
  const endSession = useEndSession()
  return async () => {
    const returnTo = `${window.location.pathname}${window.location.search}`
    if (await endSession()) window.location.assign(signInHref(returnTo, { selectAccount: true }))
  }
}

export function NavUser() {
  const { t } = useTranslation("auth")
  const user = useCurrentUser()
  const logOut = useLogOut()
  const switchAccount = useSwitchAccount()
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
        <DropdownMenuLabel className="p-1 font-normal">
          <div className="grid gap-1.5 rounded-md bg-muted/60 px-3 py-2.5 leading-tight">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={name}>
                {name}
              </span>
              {user.console && (
                <Badge variant="secondary" className="max-w-28 shrink-0 truncate">
                  {user.console.roleName}
                </Badge>
              )}
            </div>
            <span className="truncate text-xs text-muted-foreground" title={user.email}>
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <WorkspaceSwitcher />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void switchAccount()}>{t("switchAccount")}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => void logOut()}>
          {t("logOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
