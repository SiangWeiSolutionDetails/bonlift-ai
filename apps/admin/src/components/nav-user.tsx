import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MenuBand } from "@/components/menu-band"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <MenuBand
          aside={user.console && <span className="max-w-28 shrink-0 truncate normal-case">{user.console.roleName}</span>}
        >
          {t("signedIn")}
        </MenuBand>
        <div className="grid gap-0.5 px-3 py-2.5 leading-tight">
          <span className="truncate text-sm font-semibold" title={name}>
            {name}
          </span>
          <span className="truncate text-xs text-muted-foreground" title={user.email}>
            {user.email}
          </span>
        </div>
        <WorkspaceSwitcher />
        <MenuBand>{t("account")}</MenuBand>
        <div className="p-1">
          <DropdownMenuItem className="cursor-pointer px-2 py-1.5" onSelect={() => void switchAccount()}>
            {t("switchAccount")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" className="cursor-pointer px-2 py-1.5" onSelect={() => void logOut()}>
            {t("logOut")}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
