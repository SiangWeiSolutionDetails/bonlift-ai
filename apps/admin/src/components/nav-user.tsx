import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { MenuBand } from "@/components/menu-band"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout, signInHref } from "@/features/auth/api"
import type { KnownAccount } from "@/features/auth/known-accounts"
import { forgetAccount } from "@/features/auth/known-accounts"
import { isProviderAvailable } from "@/features/auth/providers"
import { useAuthProviders, useCurrentUser } from "@/features/auth/queries"
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

// Land on "/" so the new account opens its own default workspace, never the previous account's page.
// A provider that is off (or not yet known) falls back to the login page, which explains why.
function useSwitchToAccount() {
  const endSession = useEndSession()
  const navigate = useNavigate()
  const { data: providers } = useAuthProviders()
  return async ({ email, provider }: KnownAccount) => {
    const available = isProviderAvailable(providers, provider)
    if (!(await endSession())) return
    if (available) window.location.assign(signInHref(provider, "/", { loginHint: email }))
    else await navigate({ to: "/login", search: { returnTo: "/" } })
  }
}

// One session per browser: adding an account signs out the current one, which stays remembered.
// The login page lets the user pick a provider, then shows that provider's account chooser.
function useAddAccount() {
  const endSession = useEndSession()
  const navigate = useNavigate()
  return async () => {
    if (await endSession()) await navigate({ to: "/login", search: { returnTo: "/", selectAccount: true } })
  }
}


type AccountLines = Pick<KnownAccount, "email" | "displayName">

function AccountText({ account, bold = false }: { account: AccountLines; bold?: boolean }) {
  const name = account.displayName ?? account.email
  return (
    <span className="grid min-w-0 flex-1 leading-tight" title={account.email}>
      <span className={cn("truncate", bold && "font-semibold")}>{name}</span>
      {name !== account.email && <span className="truncate text-xs text-muted-foreground">{account.email}</span>}
    </span>
  )
}

function SwitchAccountMenu({ onSwitch, onAdd }: { onSwitch: (account: KnownAccount) => void; onAdd: () => void }) {
  const { t } = useTranslation("auth")
  const user = useCurrentUser()
  const others = useKnownAccounts().filter((a) => a.email.toLowerCase() !== user.email.toLowerCase())

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer px-2 py-1.5">{t("switchAccount")}</DropdownMenuSubTrigger>
      {/* The trigger sits inside the menu's padding, so the offset is what clears the main menu's edge */}
      <DropdownMenuSubContent sideOffset={10} className="w-64 max-w-[calc(100vw-2rem)]">
        {others.map((account) => (
          <DropdownMenuItem
            key={account.email}
            onSelect={() => onSwitch(account)}
            aria-label={t("switchToAccount", { email: account.email })}
            className="cursor-pointer px-2 py-1.5"
          >
            <AccountText account={account} />
          </DropdownMenuItem>
        ))}
        {others.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem className="cursor-pointer px-2 py-1.5" onSelect={onAdd}>
          {t("addAccount")}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function NavUser() {
  const { t } = useTranslation("auth")
  const user = useCurrentUser()
  const logOut = useLogOut()
  const switchToAccount = useSwitchToAccount()
  const addAccount = useAddAccount()
  const removeThisAccount = useRemoveThisAccount(user.email)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const name = user.displayName ?? user.email
  useRememberCurrentAccount(user.email, user.displayName, user.provider)

  return (
    <>
      <ConfirmDialog
        open={confirmingRemove}
        title={t("removeAccountConfirm.title", { email: user.email })}
        description={t("removeAccountConfirm.signedInDescription")}
        confirmLabel={t("removeAccountConfirm.confirm")}
        destructive
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={() => {
          setConfirmingRemove(false)
          void removeThisAccount()
        }}
      />
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
            {t("account")}
          </MenuBand>
          <div className="flex flex-col gap-1 p-1">
            <div className="flex px-2 py-1.5 text-sm">
              <AccountText account={user} bold />
            </div>
            <SwitchAccountMenu onSwitch={(account) => void switchToAccount(account)} onAdd={() => void addAccount()} />
          </div>
          <WorkspaceSwitcher />
          <MenuBand>{t("actions")}</MenuBand>
          <div className="p-1">
            <DropdownMenuItem className="cursor-pointer px-2 py-1.5" onSelect={() => setConfirmingRemove(true)}>
              {t("removeThisAccount")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" className="cursor-pointer px-2 py-1.5" onSelect={() => void logOut()}>
              {t("logOut")}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
