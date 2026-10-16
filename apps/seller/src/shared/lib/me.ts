import { AuthApi, SubaccountAuthApi } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit/data"
import { useAuthStatus } from "./api"
import { getSessionKind } from "./session-kind"

export interface SellerAccount {
    id: string
    nickname: string | null
    phone: string
    preferredLocale: string | null
    loginName?: string
}

const me = createMeQuery<SellerAccount | undefined>({
    scope: "me",
    queryFn: async () => {
        // 会话种类必须在调用时读，不能装配时定死：子账号会话下打 /auth/me 会 401，且同标签页先店主后子账号是常态
        if (getSessionKind() === "subaccount") {
            const subaccount = await SubaccountAuthApi.getSubaccountMe()
            return {
                id: subaccount.id,
                nickname: null,
                phone: subaccount.phone,
                preferredLocale: null,
                loginName: subaccount.loginName,
            }
        }
        const owner = await AuthApi.me()
        return {
            id: owner.id,
            nickname: owner.nickname,
            phone: owner.phone,
            preferredLocale: owner.preferredLocale,
        }
    },
    useAuthStatus,
    userIdOf: (value) => value?.id,
})

export const useMe = me.useMe

// useClearMe 登录成功与登出都要调：两种会话共用同一格缓存，不清就刚登录顶着上一位名字直到新鲜期结束
export const useClearMe = me.useClearMe

export const ME_QUERY_KEY = me.ME_QUERY_KEY
