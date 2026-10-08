import type { ReactNode } from "react"
import { useRouterState } from "@tanstack/react-router"
import { AuthApi } from "@shop/api/sdk"
import { AccountLocaleProvider } from "@shop/app-kit/i18n"
import type { AppLocale } from "@shop/common/i18n"
import { useAuthStatus } from "#/shared/api/auth"
import { parseLocalePath } from "#/shared/lib/locale-url"
import { SITE_ORIGIN } from "#/shared/lib/env"
import { ME_QUERY_KEY, useMe } from "./queries"

const saveLocale = (preferredLocale: AppLocale, expectedAccountId: string) =>
    AuthApi.updateUserLocalePreference({ body: { preferredLocale, expectedAccountId } })

export function AccountLocaleSync({ children }: { children: ReactNode }) {
    const authStatus = useAuthStatus()
    const me = useMe()
    const explicit = useRouterState({
        select: (state) =>
            Boolean(
                parseLocalePath(new URL(state.location.publicHref, SITE_ORIGIN).pathname).locale,
            ),
    })
    return (
        <AccountLocaleProvider
            account={me.data}
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
