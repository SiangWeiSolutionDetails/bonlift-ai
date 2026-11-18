import { LayoutGridIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useCurrentWorkspace } from "../use-workspace"

export function SidebarWorkspaceHeader() {
  const { t } = useTranslation("auth")
  const workspace = useCurrentWorkspace()
  if (!workspace) return null

  const isConsole = workspace.kind === "console"
  const title = isConsole ? t("workspaces.console") : workspace.brandName
  const subtitle = isConsole ? null : workspace.tenantName
  const tooltip = subtitle ? `${title} · ${subtitle}` : title

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild size="lg" tooltip={tooltip} className="cursor-default">
            <div title={tooltip}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                {isConsole ? <LayoutGridIcon className="size-4" /> : title.charAt(0).toUpperCase()}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate font-medium">{title}</span>
                {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  )
}
