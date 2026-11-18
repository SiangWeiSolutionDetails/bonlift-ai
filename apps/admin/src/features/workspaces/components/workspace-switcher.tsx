import { useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { CurrentMark } from "@/components/current-mark"
import { MenuBand } from "@/components/menu-band"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useCurrentUser } from "@/features/auth/queries"
import { filterTenants } from "../filter-tenants"
import { useCurrentWorkspace } from "../use-workspace"
import {
  buildWorkspaces,
  CONSOLE_KEY,
  writeLastWorkspace,
} from "../workspaces"

const SEARCH_THRESHOLD = 8

function useSwitchWorkspace() {
  const navigate = useNavigate()
  return (key: string) => {
    writeLastWorkspace(key)
    void navigate({ to: key === CONSOLE_KEY ? "/console" : `/b/${key}` })
  }
}

type WorkspaceRowProps = {
  title: string
  subtitle?: string
  role?: string
  current: boolean
  onSwitch: () => void
}

function WorkspaceRow({ title, subtitle, role, current, onSwitch }: WorkspaceRowProps) {
  return (
    <DropdownMenuItem
      onSelect={onSwitch}
      title={[title, subtitle, role].filter(Boolean).join(" · ")}
      aria-current={current ? "true" : undefined}
      className="cursor-pointer gap-3 px-2 py-1.5"
    >
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className={cn("truncate", current && "font-semibold")}>{title}</span>
        {subtitle && (
          <span className="truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {role && (
        <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">
          {role}
        </span>
      )}
      <CurrentMark current={current} />
    </DropdownMenuItem>
  )
}

function WorkspaceGroup({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <DropdownMenuGroup>
      {name && (
        <DropdownMenuLabel className="truncate px-2 pt-0.5 pb-1 text-xs font-medium text-muted-foreground" title={name}>
          {name}
        </DropdownMenuLabel>
      )}
      {children}
    </DropdownMenuGroup>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation("auth")
  return (
    <div className="px-2 pt-2">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key.length === 1 || event.key === "Backspace") event.stopPropagation()
        }}
        placeholder={t("workspaces.search")}
        aria-label={t("workspaces.search")}
        className="h-7 text-sm"
      />
    </div>
  )
}

export function WorkspaceSwitcher() {
  const { t } = useTranslation("auth")
  const me = useCurrentUser()
  const current = useCurrentWorkspace()
  const switchTo = useSwitchWorkspace()
  const [query, setQuery] = useState("")
  const workspaces = buildWorkspaces(me)
  const brandCount = workspaces.tenants.reduce((n, tenant) => n + tenant.brands.length, 0)
  const searchable = brandCount > SEARCH_THRESHOLD
  const tenants = filterTenants(workspaces.tenants, query)
  const currentBrandId = current?.kind === "brand" ? current.brandId : null

  return (
    <DropdownMenuGroup>
      <MenuBand aside={<span className="tabular-nums">{workspaces.count}</span>}>{t("workspaces.heading")}</MenuBand>
      {searchable && <SearchBox value={query} onChange={setQuery} />}
      <div className={cn("flex flex-col gap-3 p-1", searchable && "max-h-72 overflow-y-auto")}>
        {workspaces.console && (
          <WorkspaceGroup>
            <WorkspaceRow
              title={t("workspaces.console")}
              subtitle={t("workspaces.consoleHint")}
              current={current?.kind === "console"}
              onSwitch={() => switchTo(CONSOLE_KEY)}
            />
          </WorkspaceGroup>
        )}
        {tenants.map((tenant) => (
          <WorkspaceGroup key={tenant.tenantId} name={tenant.tenantName}>
            {tenant.brands.map((brand) => (
              <WorkspaceRow
                key={brand.brandId}
                title={brand.brandName}
                role={brand.roleName ?? undefined}
                current={brand.brandId === currentBrandId}
                onSwitch={() => switchTo(brand.brandId)}
              />
            ))}
          </WorkspaceGroup>
        ))}
        {searchable && query.trim() && tenants.length === 0 && (
          <p className="px-2 py-1 text-sm text-muted-foreground">{t("workspaces.noMatches")}</p>
        )}
      </div>
    </DropdownMenuGroup>
  )
}
