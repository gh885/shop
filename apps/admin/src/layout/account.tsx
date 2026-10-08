import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { WorkbenchAccount } from "@shop/app-kit/shell"
import { Button, Spinner } from "@shop/ui-web"
import { LogOutIcon } from "lucide-react"
import { AdminAuthApi } from "@shop/api/sdk"
import { useT } from "#/locales/use-t"
import { getDeviceId, tokenStore } from "../shared/lib/api"
import { useClearMe, useMe } from "../shared/lib/me"

/** 管理员身份与会话逻辑留在本端，账号呈现复用工作台组件。 */
export function Account() {
    const t = useT()
    const navigate = useNavigate()
    const { data: me } = useMe()
    const clearMe = useClearMe()
    const logout = useMutation({
        mutationFn: () => AdminAuthApi.staffLogout({ body: { deviceId: getDeviceId() } }),
        // 会话终结：无论接口成功失败都清本地态、回登录页，所以不让全局弹失败提示
        // （本地身份已清、人已经在登录页，再弹一条「退出失败」只会让人以为没退掉）
        meta: { silentError: true },
        onSettled: () => {
            tokenStore.clear()
            clearMe()
            void navigate({ to: "/login" })
        },
    })

    return (
        <WorkbenchAccount
            name={me?.displayName ?? "—"}
            description={me?.employeeNo ?? t("account.description")}
            logoutAction={
                <Button
                    variant="ghost"
                    className="w-full justify-between"
                    disabled={logout.isPending}
                    onClick={() => logout.mutate()}
                >
                    {t("account.logout")}
                    {logout.isPending ? <Spinner /> : <LogOutIcon />}
                </Button>
            }
        />
    )
}
