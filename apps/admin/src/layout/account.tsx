import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { WorkbenchAccount } from "@shop/app-kit/shell"
import { Button, Spinner } from "@shop/ui-web"
import { LogOutIcon } from "lucide-react"
import { AdminAuthApi } from "@shop/api/sdk"
import { useT } from "#/locales/use-t"
import { getDeviceId, tokenStore } from "../shared/lib/api"
import { useClearMe, useMe } from "../shared/lib/me"

export function Account() {
    const t = useT()
    const navigate = useNavigate()
    const { data: me } = useMe()
    const clearMe = useClearMe()
    const logout = useMutation({
        mutationFn: () => AdminAuthApi.staffLogout({ body: { deviceId: getDeviceId() } }),
        // 尽力而为的退出：无论成败都清本地态回登录页，所以 silentError 且 onSettled 也别改成只成功才跳
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
