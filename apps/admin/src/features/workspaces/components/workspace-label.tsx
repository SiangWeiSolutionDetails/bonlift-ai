import { useTranslation } from "react-i18next"
import { useCurrentWorkspace } from "../use-workspace"

export function WorkspaceLabel() {
  const { t } = useTranslation("auth")
  const workspace = useCurrentWorkspace()
  if (!workspace) return null

  if (workspace.kind === "console") {
    return <span className="shrink-0 text-sm font-medium">{t("workspaces.console")}</span>
  }
  return (
    <div
      className="grid min-w-0 max-w-[40vw] leading-tight sm:max-w-64"
      title={`${workspace.brandName} · ${workspace.tenantName}`}
    >
      <span className="truncate text-sm font-medium">{workspace.brandName}</span>
      <span className="truncate text-xs text-muted-foreground">{workspace.tenantName}</span>
    </div>
  )
}
