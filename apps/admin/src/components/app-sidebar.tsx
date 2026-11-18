"use client"

import * as React from "react"
import { useMatches, useRouter, type StaticDataRouteOption } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { NavMain } from "@/components/nav-main"
import { usePermissions } from "@/features/auth/permissions"
import { SidebarWorkspaceHeader } from "@/features/workspaces/components/sidebar-workspace-header"
import { BRAND_ROUTE_ID, CONSOLE_ROUTE_ID, useWorkspaceKey } from "@/features/workspaces/use-workspace"
import { CONSOLE_KEY } from "@/features/workspaces/workspaces"
import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from "@/components/ui/sidebar"

type GroupKey = NonNullable<StaticDataRouteOption["groupKey"]>
type NavItems = React.ComponentProps<typeof NavMain>["items"]

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { routesById } = useRouter()
  const activePath = useMatches({ select: (matches) => matches.at(-1)?.fullPath })
  const { hasAccess } = usePermissions()
  const workspaceKey = useWorkspaceKey()

  // Outside a workspace (e.g. the no-access page) there is nothing to list
  const brandId = workspaceKey && workspaceKey !== CONSOLE_KEY ? workspaceKey : undefined
  const layoutRoute = workspaceKey ? routesById[brandId ? BRAND_ROUTE_ID : CONSOLE_ROUTE_ID] : null

  const navGroups = new Map<GroupKey, NavItems>()
  for (const route of layoutRoute?.children ?? []) {
    const { titleKey, groupKey, icon, access } = route.options.staticData ?? {}
    if (!titleKey || !groupKey || !icon) continue
    if (access && !hasAccess(access, brandId)) continue
    const items = navGroups.get(groupKey) ?? []
    items.push({
      title: t(titleKey),
      // Index routes ("/console/") carry no staticData, so they never reach here
      url: route.fullPath as NavItems[number]["url"],
      params: brandId ? { brandId } : undefined,
      icon,
      isActive: route.fullPath === activePath,
    })
    navGroups.set(groupKey, items)
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarWorkspaceHeader />
      <SidebarContent>
        {[...navGroups].map(([groupKey, items]) => (
          <NavMain key={groupKey} label={t(groupKey)} items={items} />
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
