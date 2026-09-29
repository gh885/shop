import { BellIcon, BookOpenIcon, CircleHelpIcon, HeadsetIcon, LogOutIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { Button, Spinner } from "@shop/ui-web"
import { WorkbenchAccount, WorkbenchTopBar, WorkbenchTopBarAction } from "@shop/app-kit"

import { useT } from "#/locales/use-t"
import { logout } from "#/shared/lib/api"
import { useClearMe, useMe } from "#/shared/lib/me"

export function AppTopBar(props: { title: string; minimal?: boolean; sticky?: boolean }) {
    const t = useT()
    return (
        <WorkbenchTopBar
            {...props}
            brand={t("seller.layout.brand")}
            home={{ to: "/" }}
            account={<AccountChip />}
            actions={
                <>
                    <WorkbenchTopBarAction
                        icon={<BellIcon />}
                        label={t("seller.topbar.messages")}
                    />
                    <WorkbenchTopBarAction
                        icon={<BookOpenIcon />}
                        label={t("seller.topbar.rules")}
                    />
                    <WorkbenchTopBarAction
                        icon={<CircleHelpIcon />}
                        label={t("seller.topbar.help")}
                    />
                    <WorkbenchTopBarAction
                        icon={<HeadsetIcon />}
                        label={t("seller.topbar.support")}
                    />
                </>
            }
        />
    )
}

// fallow-ignore-next-line complexity
function AccountChip() {
    const t = useT()
    const navigate = useNavigate()
    const { data: me } = useMe()
    const clearMe = useClearMe()
    const name = me?.nickname ?? me?.phone ?? t("seller.account.notLoggedIn")
    const logoutMutation = useMutation({
        mutationFn: () => logout(),
        // 会话终结：无论接口成功失败都清除身份缓存、回登录页，所以不让全局弹失败提示
        // （本地身份已清、人已经在登录页，再弹一条「退出失败」只会让人以为没退掉）
        meta: { silentError: true },
        onSettled: () => {
            clearMe()
            void navigate({ to: "/login" })
        },
    })

    return (
        <WorkbenchAccount
            name={name}
            description={t("seller.account.description")}
            logoutAction={
                <Button
                    variant="ghost"
                    className="w-full justify-between"
                    disabled={logoutMutation.isPending}
                    onClick={() => logoutMutation.mutate()}
                >
                    {t("seller.account.logout")}
                    {logoutMutation.isPending ? <Spinner /> : <LogOutIcon />}
                </Button>
            }
        />
    )
}
