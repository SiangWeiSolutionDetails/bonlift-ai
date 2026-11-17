"use client"

import * as React from "react"
import { useMatches, useRouter, type StaticDataRouteOption } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { NavMain } from "@/components/nav-main"
import { usePermissions } from "@/features/auth/permissions"
import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { routesById } = useRouter()
  const activePath = useMatches({ select: (matches) => matches.at(-1)?.fullPath })
  const { hasAccess } = usePermissions()

  type GroupKey = NonNullable<StaticDataRouteOption["groupKey"]>
  const navGroups = new Map<GroupKey, React.ComponentProps<typeof NavMain>["items"]>()
  for (const route of routesById["/_app"].children ?? []) {
    const { titleKey, groupKey, icon, access } = route.options.staticData ?? {}
    if (!titleKey || !groupKey || !icon) continue
    if (access && !hasAccess(access)) continue
    const items = navGroups.get(groupKey) ?? []
    items.push({
      title: t(titleKey),
      url: route.fullPath,
      icon,
      isActive: route.fullPath === activePath,
    })
    navGroups.set(groupKey, items)
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        {[...navGroups].map(([groupKey, items]) => (
          <NavMain key={groupKey} label={t(groupKey)} items={items} />
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
