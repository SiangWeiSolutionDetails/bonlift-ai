import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { CheckIcon, SearchIcon } from "lucide-react"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useCurrentUser } from "@/features/auth/queries"
import { filterTenants } from "../filter-tenants"
import { useCurrentWorkspace } from "../use-workspace"
import {
  buildWorkspaces,
  CONSOLE_KEY,
  writeLastWorkspace,
  type BrandWorkspace,
} from "../workspaces"

const SEARCH_THRESHOLD = 8

function useSwitchWorkspace() {
  const navigate = useNavigate()
  return (key: string) => {
    writeLastWorkspace(key)
    void navigate({ to: key === CONSOLE_KEY ? "/console" : `/b/${key}` })
  }
}

function Tick({ visible }: { visible: boolean }) {
  return <CheckIcon className={visible ? "ml-auto" : "ml-auto invisible"} />
}

function BrandRow({ brand, current, onSwitch }: { brand: BrandWorkspace; current: boolean; onSwitch: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSwitch} title={`${brand.brandName} · ${brand.roleName}`}>
      <span className="min-w-0 flex-1 truncate">{brand.brandName}</span>
      <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">{brand.roleName}</span>
      <Tick visible={current} />
    </DropdownMenuItem>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation("auth")
  return (
    <div className="relative px-1 pb-1">
      <SearchIcon className="pointer-events-none absolute top-2 left-3.5 size-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key.length === 1 || event.key === "Backspace") event.stopPropagation()
        }}
        placeholder={t("workspaces.search")}
        aria-label={t("workspaces.search")}
        className="h-7 pl-7 text-sm"
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
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        {t("workspaces.title", { count: workspaces.count })}
      </DropdownMenuLabel>
      {searchable && <SearchBox value={query} onChange={setQuery} />}
      <div className={searchable ? "max-h-72 overflow-y-auto" : undefined}>
        {workspaces.console && (
          <DropdownMenuItem onSelect={() => switchTo(CONSOLE_KEY)}>
            <span className="min-w-0 flex-1 truncate">{t("workspaces.console")}</span>
            <Tick visible={current?.kind === "console"} />
          </DropdownMenuItem>
        )}
        {tenants.map((tenant, index) => (
          <DropdownMenuGroup key={tenant.tenantId}>
            {(index > 0 || workspaces.console) && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground" title={tenant.tenantName}>
              {tenant.tenantName}
            </DropdownMenuLabel>
            {tenant.brands.map((brand) => (
              <BrandRow
                key={brand.brandId}
                brand={brand}
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
