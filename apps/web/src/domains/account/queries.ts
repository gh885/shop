import { queryOptions } from "@tanstack/react-query"

import { BuyerAccountControllerApi, BuyerAuthControllerApi, type Me } from "@shop/api/sdk"

import { createMeQuery } from "@shop/app-kit/data"
import { useAuthStatus } from "#/shared/api/auth"

const me = createMeQuery<Me | undefined>({
    scope: "me",
    queryFn: () => BuyerAuthControllerApi.buyerMe(),
    useAuthStatus,
    userIdOf: (value) => value?.buyerId,
})

/** 当前用户缓存 key（登录/登出/资料更新的失效入口，profile 页也引用它） */
export const { ME_QUERY_KEY } = me

/** 当前登录用户信息（未登录时不发请求） */
export const useMe = me.useMe

/** 登出等场景下清除缓存的用户信息 */
export const useClearMe = me.useClearMe

/** 设备列表 key 工厂：all 是失效入口（前缀匹配），list 额外带当前设备 id */
export const deviceKeys = {
    all: ["devices"] as const,
    list: (currentDeviceId: string) => [...deviceKeys.all, currentDeviceId] as const,
}

/**
 * 登录设备列表：后端不传参、也不标「本机」——哪台是本机由前端拿自己的 deviceId 比。
 * key 里仍带 currentDeviceId：换了设备（同浏览器换账号/清了 localStorage）要重新渲染「本机」标记。
 */
export const devicesOptions = (currentDeviceId: string) =>
    queryOptions({
        queryKey: deviceKeys.list(currentDeviceId),
        queryFn: () => BuyerAccountControllerApi.devices(),
    })

/**
 * 注销状态只有一条 key（后端按 token 认人，没有参数），所以 `all` 就是本体：
 * 提交申请与撤销都从前缀失效它。
 */
export const deletionKeys = {
    all: ["account-deletion"] as const,
}

/** 注销状态：有没有待生效的申请、哪一刻生效。 */
export const deletionStatusOptions = () =>
    queryOptions({
        queryKey: deletionKeys.all,
        queryFn: () => BuyerAccountControllerApi.deletionStatus(),
    })
