import { BellIcon, BookOpenIcon, CircleHelpIcon, HeadsetIcon, LogOutIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button, Spinner } from "@shop/ui-web"
import { WorkbenchAccount, WorkbenchTopBar, WorkbenchTopBarAction } from "@shop/app-kit"

import { logout } from "#/shared/lib/api"
import { ME_QUERY_KEY, useMe } from "#/shared/lib/me"

export function AppTopBar(props: { title: string; minimal?: boolean; sticky?: boolean }) {
    return (
        <WorkbenchTopBar
            {...props}
            brand="卖家中心"
            home={{ to: "/" }}
            account={<AccountChip />}
            actions={
                <>
                    <WorkbenchTopBarAction
                        icon={<BellIcon />}
                        label="消息"
                        dot
                    />
                    <WorkbenchTopBarAction
                        icon={<BookOpenIcon />}
                        label="规则"
                    />
                    <WorkbenchTopBarAction
                        icon={<CircleHelpIcon />}
                        label="帮助"
                    />
                    <WorkbenchTopBarAction
                        icon={<HeadsetIcon />}
                        label="客服"
                    />
                </>
            }
        />
    )
}

function AccountChip() {
    const navigate = useNavigate()
    const { data: me } = useMe()
    const queryClient = useQueryClient()
    const name = me?.nickname ?? me?.phone ?? "未登录"
    const logoutMutation = useMutation({
        mutationFn: () => logout(),
        // 会话终结：无论接口成功失败都清除身份缓存。
        onSettled: () => {
            queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
            void navigate({ to: "/login" })
        },
    })

    return (
        <WorkbenchAccount
            name={name}
            description="卖家账号"
            logoutAction={
                <Button
                    variant="ghost"
                    className="w-full justify-between"
                    disabled={logoutMutation.isPending}
                    onClick={() => logoutMutation.mutate()}
                >
                    退出登录
                    {logoutMutation.isPending ? <Spinner /> : <LogOutIcon />}
                </Button>
            }
        />
    )
}
