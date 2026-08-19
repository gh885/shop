import { Outlet } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@shop/ui-web"

import { AppSidebar } from "./app-sidebar"
import { AppTopBar } from "./app-topbar"

// 壳：顶栏（一级 Tab）+ 侧栏（当前域子菜单）+ 内容区。
// 导航数据源见 nav.ts：加页面只改那一处。
export function AdminLayout() {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <AppTopBar />
                <main className="flex flex-1 flex-col p-6">
                    <Outlet />
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
