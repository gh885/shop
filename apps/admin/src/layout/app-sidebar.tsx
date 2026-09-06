import { Link, useLocation } from "@tanstack/react-router"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@shop/ui-web"
import { ShoppingBagIcon } from "lucide-react"

import { Account } from "./account"
import { activeDomain } from "./nav"

/** 左侧二级菜单：只渲染当前业务域的子菜单 */
export function AppSidebar() {
    const { pathname } = useLocation()
    const domain = activeDomain(pathname)

    // 工作台这类无菜单的域：不渲染侧栏，内容区全宽
    if (!domain || domain.groups.length === 0) return

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <div className="flex items-center gap-2 px-2 py-1.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                        <ShoppingBagIcon className="size-4" />
                    </div>
                    <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
                        Shop 平台
                    </span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                {domain.groups.map((group, i) => (
                    <SidebarGroup key={group.label ?? group.items[0]?.label ?? i}>
                        {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {group.items.map((item) => (
                                    <SidebarMenuItem key={item.label}>
                                        <SidebarMenuButton
                                            isActive={pathname === item.link.to}
                                            render={<Link {...item.link} />}
                                        >
                                            {item.icon && <item.icon />}
                                            <span>{item.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
            <SidebarFooter>
                <Account />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
