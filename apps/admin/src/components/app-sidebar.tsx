"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"
import { ROUTES } from "@/routes"

// This is sample data.
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
}

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  activePath: string
}

export function AppSidebar({ activePath, ...props }: AppSidebarProps) {
  const { t } = useTranslation()
  const navMain = ROUTES.map((route) => ({
    title: t(route.titleKey),
    url: route.path,
    icon: route.icon,
    isActive: route.path === activePath,
  }))

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
