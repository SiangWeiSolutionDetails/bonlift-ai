"use client"

import * as React from "react"
import { useMatches, useRouter, type StaticDataRouteOption } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"

// This is sample data.
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { routeTree } = useRouter()
  const activePath = useMatches({ select: (matches) => matches.at(-1)?.fullPath })

  type GroupKey = NonNullable<StaticDataRouteOption["groupKey"]>
  const navGroups = new Map<GroupKey, React.ComponentProps<typeof NavMain>["items"]>()
  for (const route of routeTree.children ?? []) {
    const { titleKey, groupKey, icon } = route.options.staticData ?? {}
    if (!titleKey || !groupKey || !icon) continue
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
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
