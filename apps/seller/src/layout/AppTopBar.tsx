import { BellIcon, BookOpenIcon, CircleHelpIcon, HeadsetIcon, LogOutIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { Button, Spinner } from "@shop/ui-web"
import { WorkbenchAccount, WorkbenchTopBar, WorkbenchTopBarAction } from "@shop/app-kit/shell"
import { useT } from "#/locales/use-t"
import { logout } from "#/shared/lib/api"
import { useClearMe, useMe } from "#/shared/lib/me"

import type { SellerMessageKey } from "#/locales/messages.gen"

export function AppTopBar(props: { title: string; minimal?: boolean; sticky?: boolean }) {
    const t = useT()
    return (
        <WorkbenchTopBar
            {...props}
            brand={t("layout.brand")}
            home={{ to: "/" }}
            account={<AccountChip />}
            actions={
                <>
                    {TOPBAR_ACTIONS.map((action) => (
                        <WorkbenchTopBarAction
                            key={action.labelKey}
                            icon={action.icon}
                            label={t(action.labelKey)}
                        />
                    ))}
                </>
            }
        />
    )
}

const TOPBAR_ACTIONS = [
    { labelKey: "topbar.messages", icon: <BellIcon /> },
    { labelKey: "topbar.rules", icon: <BookOpenIcon /> },
    { labelKey: "topbar.help", icon: <CircleHelpIcon /> },
    { labelKey: "topbar.support", icon: <HeadsetIcon /> },
] satisfies readonly { labelKey: SellerMessageKey; icon: React.ReactNode }[]

function AccountChip() {
    const t = useT()
    const navigate = useNavigate()
    const { data: me } = useMe()
    const clearMe = useClearMe()
    // 子账号没有昵称，用登录名；店主照旧昵称 → 手机号 → 未登录
    const name = me?.loginName ?? me?.nickname ?? me?.phone ?? t("account.notLoggedIn")
    const logoutMutation = useMutation({
        mutationFn: () => logout(),
        // 会话终结无论成败都清身份缓存、回登录页，故压制全局失败提示，免得让人以为没退掉
        meta: { silentError: true },
        onSettled: () => {
            clearMe()
            void navigate({ to: "/login" })
        },
    })

    return (
        <WorkbenchAccount
            name={name}
            description={t("account.description")}
            logoutAction={
                <Button
                    variant="ghost"
                    className="w-full justify-between"
                    disabled={logoutMutation.isPending}
                    onClick={() => logoutMutation.mutate()}
                >
                    {t("account.logout")}
                    {logoutMutation.isPending ? <Spinner /> : <LogOutIcon />}
                </Button>
            }
        />
    )
}
