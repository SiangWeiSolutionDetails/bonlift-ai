import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MenuBand } from "@/components/menu-band"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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

// Signs out first: a still-signed-in account would be remembered again on the next load
function useRemoveThisAccount(email: string) {
  const endSession = useEndSession()
  const navigate = useNavigate()
  return async () => {
    if (!(await endSession())) return
    forgetAccount(email)
    await navigate({ to: "/login" })
  }
}

// Land on "/" so the new account opens its own default workspace, never the previous account's page
function useSwitchToAccount() {
  const endSession = useEndSession()
  return async (email: string) => {
    if (await endSession()) window.location.assign(signInHref("/", { loginHint: email }))
  }
}

// One session per browser: adding an account signs out the current one, which stays remembered
function useAddAccount() {
  const endSession = useEndSession()
  return async () => {
    if (await endSession()) window.location.assign(signInHref("/", { selectAccount: true }))
  }
}

type AccountRowProps = {
  account: Pick<KnownAccount, "email" | "displayName">
  current: boolean
  onSwitch: () => void
}

function AccountRow({ account, current, onSwitch }: AccountRowProps) {
  const name = account.displayName ?? account.email

  // The row itself is not clickable: switching only happens through the Switch button
  return (
    <div
      title={account.email}
      aria-current={current ? "true" : undefined}
      className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
    >
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className={cn("truncate", current && "font-semibold")}>{name}</span>
        {name !== account.email && <span className="truncate text-xs text-muted-foreground">{account.email}</span>}
      </span>
      {!current && <SwitchAccountItem email={account.email} onSwitch={onSwitch} />}
    </div>
  )
}

function SwitchAccountItem({ email, onSwitch }: { email: string; onSwitch: () => void }) {
  const { t } = useTranslation("auth")
  return (
    <DropdownMenuItem
      onSelect={onSwitch}
      aria-label={t("switchToAccount", { email })}
      className="h-7 w-18 shrink-0 cursor-pointer justify-center rounded-md border px-0 py-0 text-xs font-medium"
    >
      {t("switch")}
    </DropdownMenuItem>
  )
}

function AccountList({ onSwitch }: { onSwitch: (email: string) => void }) {
  const user = useCurrentUser()
  const known = useKnownAccounts()
  const others = known.filter((a) => a.email.toLowerCase() !== user.email.toLowerCase())
  const { t } = useTranslation("auth")

  return (
    <>
      <AccountGroup label={t("currentAccount")}>
        <AccountRow account={user} current onSwitch={() => {}} />
      </AccountGroup>
      {others.length > 0 && (
        <AccountGroup label={t("otherAccounts")}>
          {others.map((account) => (
            <AccountRow
              key={account.email}
              account={account}
              current={false}
              onSwitch={() => onSwitch(account.email)}
            />
          ))}
        </AccountGroup>
      )}
    </>
  )
}

function AccountGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenuGroup className="flex flex-col gap-1">
      <DropdownMenuLabel className="px-2 pt-0.5 pb-0 text-xs font-medium text-muted-foreground">{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  )
}

export function NavUser() {
  const { t } = useTranslation("auth")
  const user = useCurrentUser()
  const logOut = useLogOut()
  const switchToAccount = useSwitchToAccount()
  const addAccount = useAddAccount()
  const removeThisAccount = useRemoveThisAccount(user.email)
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
        <div className="flex flex-col gap-3 p-1">
          <AccountList onSwitch={(email) => void switchToAccount(email)} />
          <DropdownMenuItem className="cursor-pointer px-2 py-1.5" onSelect={() => void addAccount()}>
            {t("addAccount")}
          </DropdownMenuItem>
        </div>
        <WorkspaceSwitcher />
        <MenuBand>{t("account")}</MenuBand>
        <div className="p-1">
          <DropdownMenuItem className="cursor-pointer px-2 py-1.5" onSelect={() => void removeThisAccount()}>
            {t("removeThisAccount")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" className="cursor-pointer px-2 py-1.5" onSelect={() => void logOut()}>
            {t("logOut")}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
