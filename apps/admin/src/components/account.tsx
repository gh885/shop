import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Button, cn, useSidebar } from "@shop/ui-web"
import { LogOutIcon } from "lucide-react"

import { adminApi } from "../lib/api"
import { getDeviceId, tokenStore } from "../lib/api"
import { useMe } from "../lib/me"

/** 账号头像（首字）：顶栏右侧独立展示，侧栏账号行内复用 */
export function AccountAvatar({ className }: { className?: string }) {
    const { data: me } = useMe()
    const initial = me?.displayName?.trim().charAt(0) ?? "?"

    return (
        <div
            title={me?.displayName}
            className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground",
                className,
            )}
        >
            {initial}
        </div>
    )
}

/** 侧栏底部账号行：头像 + 工号姓名 + 退出；侧栏折叠为图标时只留头像 */
export function Account() {
    const navigate = useNavigate()
    const { state } = useSidebar()
    const collapsed = state === "collapsed"

    const { data: me } = useMe()

    const logout = useMutation({
        mutationFn: () => adminApi.logout(getDeviceId()),
        onSettled: () => {
            tokenStore.clear()
            void navigate({ to: "/login" })
        },
    })

    return (
        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
            <AccountAvatar />
            {!collapsed && (
                <>
                    <div className="grid min-w-0 flex-1 gap-0.5 text-left leading-tight">
                        <span className="truncate text-sm font-medium">
                            {me?.displayName ?? "—"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                            {me?.employeeNo}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        title="退出登录"
                        disabled={logout.isPending}
                        onClick={() => logout.mutate()}
                    >
                        <LogOutIcon />
                    </Button>
                </>
            )}
        </div>
    )
}
