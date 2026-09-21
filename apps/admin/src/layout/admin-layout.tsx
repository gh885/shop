import { Outlet } from "@tanstack/react-router"
import { AppSidebar } from "./app-sidebar"
import { AppTopBar } from "./app-topbar"

/** 通栏顶栏 + 双列侧栏 + 独立滚动内容区。 */
export function AdminLayout() {
    return (
        <div className="flex h-svh w-full flex-col bg-canvas">
            <AppTopBar />
            <div className="flex min-h-0 flex-1">
                <AppSidebar />
                <div className="flex min-w-0 flex-1 rounded-tl-2xl bg-background">
                    <main className="min-w-0 flex-1 overflow-auto p-6">
                        <Outlet />
                    </main>
                </div>
            </div>
        </div>
    )
}
