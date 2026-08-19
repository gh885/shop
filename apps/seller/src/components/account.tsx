import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Button, cn, useSidebar } from "@shop/ui-web"
import { LogOutIcon } from "lucide-react"

import { logout } from "../lib/api"
import { useClearMe, useMe } from "../lib/me"

/** 账号头像（手机号/昵称首字）：顶栏右侧展示 */
export function AccountAvatar({ className }: { className?: string }) {
    const { data: me } = useMe()
    const label = me?.nickname ?? me?.phone ?? ""
    const initial = label.trim().charAt(0) ?? "?"

    return (
        <div
            title={label}
            className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-medium text-brand-foreground",
                className,
            )}
        >
            {initial || "?"}
        </div>
    )
}

/** 侧栏底部账号行：头像 + 昵称/手机号 + 退出 */
export function Account() {
    const navigate = useNavigate()
    const { state } = useSidebar()
    const collapsed = state === "collapsed"

    const { data: me } = useMe()
    const clearMe = useClearMe()

    const logoutMutation = useMutation({
        mutationFn: () => logout(),
        onSettled: () => {
            clearMe()
            void navigate({ to: "/login" })
        },
    })

    return (
        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
            <AccountAvatar />
            {!collapsed && (
                <>
                    <div className="grid min-w-0 flex-1 gap-0.5 text-left leading-tight">
                        <span className="truncate text-sm font-medium">{me?.nickname ?? "—"}</span>
                        <span className="truncate text-xs tabular-nums text-muted-foreground">
                            {me?.phone}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        title="退出登录"
                        disabled={logoutMutation.isPending}
                        onClick={() => logoutMutation.mutate()}
                    >
                        <LogOutIcon />
                    </Button>
                </>
            )}
        </div>
    )
}
