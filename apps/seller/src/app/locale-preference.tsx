import { useMemo, type ReactNode } from "react"
import { SellerLoginControllerApi } from "@shop/api/sdk"
import { AccountLocaleProvider } from "@shop/app-kit/i18n"
import type { AppLocale } from "@shop/i18n"
import { useAuthStatus } from "#/shared/lib/api"
import { ME_QUERY_KEY, useMe } from "#/shared/lib/me"

/** 把语言偏好写回后端；`expectedAccountId` 防「切换账号后误写」（见后端 `SellerLocaleService`）。 */
const saveLocale = (preferredLocale: AppLocale, expectedAccountId: string) =>
    SellerLoginControllerApi.updateSellerLocale({
        body: { preferredLocale, expectedAccountId },
    })

export function AccountLocaleSync({ children }: { children: ReactNode }) {
    const authStatus = useAuthStatus()
    const me = useMe()
    // 契约里卖家身份的主键叫 operatorId，而 provider 要的通用形状是 id
    const account = useMemo(
        () =>
            me.data
                ? { id: me.data.operatorId, preferredLocale: me.data.preferredLocale ?? null }
                : undefined,
        [me.data],
    )
    return (
        <AccountLocaleProvider
            account={account}
            authStatus={authStatus}
            accountError={me.isError}
            queryKey={ME_QUERY_KEY}
            saveLocale={saveLocale}
        >
            {children}
        </AccountLocaleProvider>
    )
}
