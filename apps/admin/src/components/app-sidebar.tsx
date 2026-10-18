"use client"

import * as React from "react"
import { useMatches, useRouter } from "@tanstack/react-router"
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

  const navMain = (routeTree.children ?? []).flatMap((route) => {
    const { titleKey, icon } = route.options.staticData ?? {}
    if (!titleKey || !icon) return []
    return [{
      title: t(titleKey),
      url: route.fullPath,
      icon,
      isActive: route.fullPath === activePath,
    }]
  })

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
