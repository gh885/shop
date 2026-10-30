import { useMemo, type ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"
import { BuyerAccountControllerApi } from "@shop/api/sdk"
import { AccountLocaleProvider } from "@shop/app-kit/i18n"
import type { AppLocale } from "@shop/i18n"
import { useAuthStatus } from "#/shared/api/auth"
import { parseLocalePath } from "#/shared/lib/locale-url"
import { SITE_ORIGIN } from "#/shared/lib/env"
import { ME_QUERY_KEY, useMe } from "./queries"

/**
 * 把语言偏好写回后端。`expectedAccountId` 是防「切换账号后误写」的时序闸
 * （见后端 `BuyerLocaleService.update`）——页面上的选择器可能还停在上一个人的状态。
 */
const saveLocale = (preferredLocale: AppLocale, expectedAccountId: string) =>
    BuyerAccountControllerApi.updateBuyerLocale({
        body: { preferredLocale, expectedAccountId },
    })

export function AccountLocaleSync({ children }: { children: ReactNode }) {
    const authStatus = useAuthStatus()
    const me = useMe()
    const account = useMemo(
        () =>
            me.data
                ? { id: me.data.buyerId, preferredLocale: me.data.preferredLocale ?? null }
                : undefined,
        [me.data],
    )
    const explicit = useRouterState({
        select: (state) =>
            Boolean(
                parseLocalePath(new URL(state.location.publicHref, SITE_ORIGIN).pathname).locale,
            ),
    })
    return (
        <AccountLocaleProvider
            account={account}
            authStatus={authStatus}
            accountError={me.isError}
            queryKey={ME_QUERY_KEY}
            preserveCurrentLocale={explicit}
            saveLocale={saveLocale}
        >
            {children}
        </AccountLocaleProvider>
    )
}
