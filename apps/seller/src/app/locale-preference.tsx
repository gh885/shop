import type { ReactNode } from "react"
import { AuthApi } from "@shop/api/sdk"
import { AccountLocaleProvider } from "@shop/app-kit/i18n"
import type { AppLocale } from "@shop/common/i18n"
import { useAuthStatus } from "#/shared/lib/api"
import { ME_QUERY_KEY, useMe } from "#/shared/lib/me"

const saveLocale = (preferredLocale: AppLocale, expectedAccountId: string) =>
    AuthApi.updateUserLocalePreference({ body: { preferredLocale, expectedAccountId } })

export function AccountLocaleSync({ children }: { children: ReactNode }) {
    const authStatus = useAuthStatus()
    const me = useMe()
    return (
        <AccountLocaleProvider
            account={me.data}
            authStatus={authStatus}
            accountError={me.isError}
            queryKey={ME_QUERY_KEY}
            saveLocale={saveLocale}
        >
            {children}
        </AccountLocaleProvider>
    )
}
