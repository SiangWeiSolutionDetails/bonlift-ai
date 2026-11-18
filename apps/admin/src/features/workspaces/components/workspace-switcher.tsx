import { useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
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
  badge?: string
  current: boolean
  onSwitch: () => void
}

// The current workspace keeps the primary colours on hover and focus too
const CURRENT_ROW =
  "bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground focus:**:text-primary-foreground"

function WorkspaceRow({ title, subtitle, badge, current, onSwitch }: WorkspaceRowProps) {
  return (
    <DropdownMenuItem
      onSelect={onSwitch}
      title={[title, subtitle, badge].filter(Boolean).join(" · ")}
      aria-current={current ? "true" : undefined}
      className={cn("gap-2.5 py-1.5", current && CURRENT_ROW)}
    >
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className={cn("truncate", current && "font-medium")}>{title}</span>
        {subtitle && (
          <span className={cn("truncate text-xs", current ? "text-primary-foreground/80" : "text-muted-foreground")}>
            {subtitle}
          </span>
        )}
      </span>
      {badge && (
        <Badge
          variant="outline"
          className={cn(
            "max-w-24 shrink-0 truncate font-normal",
            current ? "border-primary-foreground/40 text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {badge}
        </Badge>
      )}
    </DropdownMenuItem>
  )
}

function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <DropdownMenuLabel className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      <span className="flex-1">{children}</span>
      {count !== undefined && (
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
          {count}
        </Badge>
      )}
    </DropdownMenuLabel>
  )
}

function TenantLabel({ name }: { name: string }) {
  return (
    <DropdownMenuLabel
      className="truncate pt-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
      title={name}
    >
      {name}
    </DropdownMenuLabel>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation("auth")
  return (
    <div className="px-1 pb-1">
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
      <SectionLabel count={workspaces.count}>{t("workspaces.heading")}</SectionLabel>
      {searchable && <SearchBox value={query} onChange={setQuery} />}
      <div className={searchable ? "max-h-72 overflow-y-auto" : undefined}>
        {workspaces.console && (
          <WorkspaceRow
            title={t("workspaces.console")}
            subtitle={t("workspaces.consoleHint")}
            current={current?.kind === "console"}
            onSwitch={() => switchTo(CONSOLE_KEY)}
          />
        )}
        {tenants.map((tenant, index) => (
          <DropdownMenuGroup key={tenant.tenantId}>
            {(index > 0 || workspaces.console) && <DropdownMenuSeparator />}
            <TenantLabel name={tenant.tenantName} />
            {tenant.brands.map((brand) => (
              <WorkspaceRow
                key={brand.brandId}
                title={brand.brandName}
                badge={brand.roleName ?? undefined}
                current={brand.brandId === currentBrandId}
                onSwitch={() => switchTo(brand.brandId)}
              />
            ))}
          </DropdownMenuGroup>
        ))}
        {searchable && query.trim() && tenants.length === 0 && (
          <p className="px-1.5 py-1 text-sm text-muted-foreground">{t("workspaces.noMatches")}</p>
        )}
      </div>
    </DropdownMenuGroup>
  )
}
