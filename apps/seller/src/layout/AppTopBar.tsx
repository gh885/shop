import { BellIcon, BookOpenIcon, CircleHelpIcon, HeadsetIcon, LogOutIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { Button, Spinner } from "@shop/ui-web"
import { WorkbenchAccount, WorkbenchTopBar, WorkbenchTopBarAction } from "@shop/app-kit"

import { useT } from "#/locales/use-t"
import { logout } from "#/shared/lib/api"
import { useClearMe, useMe } from "#/shared/lib/me"

import type { SellerMessageKey } from "#/locales/messages.gen"

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

/**
 * 顶栏那排入口：四个形状完全相同的按钮，所以写成一张表而不是四段 JSX。
 *
 * 表里存 `labelKey`（i18n key）而不是句子，标注成 `SellerMessageKey`——加一格写错 key 是编译错误。
 * 这也是「一个文件里同类文案收成一处」值得做的判据：**形状重复**（同一组组件按数据渲染），
 * 而不是「`t()` 出现得多」——后者通常是一个屏幕一句一句的真实文案，搬走只是换位置。
 */
const TOPBAR_ACTIONS = [
    { labelKey: "seller.topbar.messages", icon: <BellIcon /> },
    { labelKey: "seller.topbar.rules", icon: <BookOpenIcon /> },
    { labelKey: "seller.topbar.help", icon: <CircleHelpIcon /> },
    { labelKey: "seller.topbar.support", icon: <HeadsetIcon /> },
] satisfies readonly { labelKey: SellerMessageKey; icon: React.ReactNode }[]

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
