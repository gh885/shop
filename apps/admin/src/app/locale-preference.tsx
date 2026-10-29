import type { ReactNode } from "react"
import { StaffLoginControllerApi } from "@shop/api/sdk"
import { AccountLocaleProvider } from "@shop/app-kit/i18n"
import type { AppLocale } from "@shop/i18n"
import { useAuthStatus } from "#/shared/lib/api"
import { ME_QUERY_KEY, useMe } from "#/shared/lib/me"

/** 把语言偏好写回后端；`expectedAccountId` 防「切换账号后误写」（见后端 `StaffProfileService`）。 */
const saveLocale = (preferredLocale: AppLocale, expectedAccountId: string) =>
    StaffLoginControllerApi.updateStaffLocale({
        body: { preferredLocale, expectedAccountId },
    })

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
