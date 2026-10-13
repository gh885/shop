import { AuthApi, SubaccountAuthApi } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit/data"
import { useAuthStatus } from "./api"
import { getSessionKind } from "./session-kind"

/**
 * 「当前登录者」查询的 seller 接线。本文件只有装配参数与**两种会话的取数分流** ——
 * 请求方法与登录态 hook 之外，没有别的逻辑。
 *
 * 为什么两个来源合成一份查询而不是各建一份：它们回答的是同一个问题（「现在是谁在操作」），
 * 消费者（顶栏账号区、语言偏好同步）不该知道自己是哪种会话。分流收在 `queryFn` 一处。
 *
 * 但也正因为它是一份查询，**换主体时必须把缓存清掉**：缓存里那一格属于上一位登录者。
 * 清点在登录成功那一刻（见 login 页的 `useClearMe()` 调用）与登出（AppTopBar）——
 * 与「当前店铺不许跨账号残留」（ACC-80）是同一条规则，不多不少。
 */

/** 店主的 `/auth/me` 与子账号的 `/auth/subaccount/me` 都归一到这一个形状 */
export interface SellerAccount {
    id: string
    /** 买家昵称（子账号没有这一格） */
    nickname: string | null
    /** 掩码或明文手机号：店主的来自买家账号，子账号的来自子账号凭证 */
    phone: string
    /** 账号级语言偏好；子账号没有账号级偏好，恒 null（切语言不落库） */
    preferredLocale: string | null
    /** 子账号登录名；店主会话没有这一格 */
    loginName?: string
}

const me = createMeQuery<SellerAccount | undefined>({
    scope: "me",
    queryFn: async () => {
        // 子账号会话下 `/auth/me` 必 401（那是买家账号体系），所以先看会话种类再决定打谁。
        // 这一读是**调用时**而不是装配时：同一个标签页里先店主、登出后子账号是常态。
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
    // 监控事件信封的 userId（契约第 1 条）；登出时 me 变 undefined 自动清空
    userIdOf: (value) => value?.id,
})

/** 当前登录者信息（未登录时不发请求） */
export const useMe = me.useMe

/**
 * 清除身份缓存（登出 / **登录成功**都要调）。
 *
 * 两种会话共用同一格缓存是刻意的（它们回答同一个问题），代价就是换主体时必须显式清掉——
 * 不然「刚登录就顶着上一位的名字」会持续到 5 分钟新鲜期结束。这与「当前店铺不许跨账号残留」
 * （ACC-80）是同一条规则。
 */
export const useClearMe = me.useClearMe

export const ME_QUERY_KEY = me.ME_QUERY_KEY
