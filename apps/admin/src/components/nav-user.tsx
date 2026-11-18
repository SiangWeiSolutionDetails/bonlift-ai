import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { CurrentMark } from "@/components/current-mark"
import { MenuBand } from "@/components/menu-band"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout, signInHref } from "@/features/auth/api"
import type { KnownAccount } from "@/features/auth/known-accounts"
import { forgetAccount } from "@/features/auth/known-accounts"
import { useCurrentUser } from "@/features/auth/queries"
import { useKnownAccounts, useRememberCurrentAccount } from "@/features/auth/use-known-accounts"
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher"
import { getErrorMessage } from "@/lib/error-message"
import { cn } from "@/lib/utils"
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

function currentPath() {
  return `${window.location.pathname}${window.location.search}`
}

function useSwitchToAccount() {
  const endSession = useEndSession()
  return async (email: string) => {
    if (await endSession()) window.location.assign(signInHref(currentPath(), { loginHint: email }))
  }
}

// One session per browser: adding an account signs out the current one, which stays remembered
function useAddAccount() {
  const endSession = useEndSession()
  return async () => {
    if (await endSession()) window.location.assign(signInHref(currentPath(), { selectAccount: true }))
  }
}

// Right end of every account row: the current mark, or the Remove item laid over the row
const SLOT = "w-14 shrink-0"

type AccountRowProps = {
  account: Pick<KnownAccount, "email" | "displayName">
  current: boolean
  onSwitch: () => void
}

function AccountRow({ account, current, onSwitch }: AccountRowProps) {
  const { t } = useTranslation("auth")
  const name = account.displayName ?? account.email

  return (
    <DropdownMenuItem
      onSelect={onSwitch}
      title={account.email}
      aria-current={current ? "true" : undefined}
      aria-label={current ? undefined : t("switchToAccount", { email: account.email })}
      className="cursor-pointer gap-3 py-1.5 pr-0 pl-2"
    >
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className={cn("truncate", current && "font-semibold")}>{name}</span>
        {name !== account.email && <span className="truncate text-xs text-muted-foreground">{account.email}</span>}
      </span>
      {current && <span className="shrink-0 text-xs text-muted-foreground">{t("signedIn")}</span>}
      <span className={cn(SLOT, "flex justify-center")}>{current && <CurrentMark current />}</span>
    </DropdownMenuItem>
  )
}

function RemoveAccountItem({ email }: { email: string }) {
  const { t } = useTranslation("auth")
  return (
    <DropdownMenuItem
      aria-label={t("removeAccountLabel", { email })}
      className={cn(SLOT, "absolute inset-y-0 right-0 cursor-pointer justify-center px-0 text-xs text-muted-foreground")}
      onSelect={(event) => {
        event.preventDefault()
        forgetAccount(email)
      }}
    >
      {t("removeAccount")}
    </DropdownMenuItem>
  )
}

function AccountList({ onSwitch }: { onSwitch: (email: string) => void }) {
  const user = useCurrentUser()
  const known = useKnownAccounts()
  const others = known.filter((a) => a.email.toLowerCase() !== user.email.toLowerCase())

  return (
    <>
      <AccountRow account={user} current onSwitch={() => {}} />
      {others.map((account) => (
        <div key={account.email} className="relative">
          <AccountRow account={account} current={false} onSwitch={() => onSwitch(account.email)} />
          <RemoveAccountItem email={account.email} />
        </div>
      ))}
    </>
  )
}

export function NavUser() {
  const { t } = useTranslation("auth")
  const user = useCurrentUser()
  const logOut = useLogOut()
  const switchToAccount = useSwitchToAccount()
  const addAccount = useAddAccount()
  const name = user.displayName ?? user.email
  useRememberCurrentAccount(user.email, user.displayName)

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
          {t("accounts")}
        </MenuBand>
        <div className="p-1">
          <AccountList onSwitch={(email) => void switchToAccount(email)} />
          <DropdownMenuItem className="cursor-pointer px-2 py-1.5" onSelect={() => void addAccount()}>
            {t("addAccount")}
          </DropdownMenuItem>
        </div>
        <WorkspaceSwitcher />
        <MenuBand>{t("account")}</MenuBand>
        <div className="p-1">
          <DropdownMenuItem variant="destructive" className="cursor-pointer px-2 py-1.5" onSelect={() => void logOut()}>
            {t("logOut")}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
