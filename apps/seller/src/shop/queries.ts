import { useSyncExternalStore } from "react"
import { queryOptions, useQuery } from "@tanstack/react-query"

import { ShopsApi, type ShopResponse } from "@shop/api/sdk"

import { useAuthStatus } from "../shared/lib/api"
import { getStoredShopId, subscribe, syncResolvedShopId } from "../shared/lib/shop-store"

export { setCurrentShopId } from "../shared/lib/shop-store"

// ---------- shop 域 queryKey 工厂（与 products 域的 productKeys 同范式：前缀结构一眼可见，invalidate 不漏 key） ----------

export const shopKeys = {
    all: ["shops"] as const,
    mine: () => ["shops", "mine"] as const,
    invites: () => ["shops", "invites"] as const,
    members: (shopId: string) => ["shops", shopId, "members"] as const,
}

// ---------- queryOptions：key 与 queryFn 共置（失败冒到路由错误页，不再包 onRetry） ----------

export const myShopsOptions = queryOptions({
    queryKey: shopKeys.mine(),
    queryFn: () => ShopsApi.listMyShops(),
    // 店铺上下文是整个工作台的前提：没有它就是路由级错误（失败按全局默认抛给官方边界 + 重置重试）
})

/** 本店成员列表：与商品的 shopId 入 key 同理——切店铺不串缓存 */
export const shopMembersOptions = (shopId: string) =>
    queryOptions({
        queryKey: shopKeys.members(shopId),
        queryFn: () => ShopsApi.listShopMembers({ path: { shopId } }),
    })

/** 待确认邀请（店铺列表页）：它是页面上的一个附属区块，消费方写的是 `if (!data || data.length === 0) return`。
 *  退出全局的「失败抛给错误边界」——拉不到邀请就当没有，不能因此把整个店铺列表页换成错误页。 */
export const shopInvitesOptions = queryOptions({
    queryKey: shopKeys.invites(),
    queryFn: () => ShopsApi.listShopInvites(),
    throwOnError: false,
})

// ---------- 我的店铺列表 ----------

export function useMyShops() {
    const status = useAuthStatus()
    // 守卫在 requireAuth 之后渲染，enabled 恒真；失败由路由错误页接管
    return useQuery({ ...myShopsOptions, enabled: status === "authed" })
}

// ---------- 店铺成员 ----------

/** 本店成员列表（成员管理页） */
export function useMyShopMembers(shopId: string) {
    return useQuery(shopMembersOptions(shopId))
}

// ---------- 当前店铺上下文（X-Shop-Id 的来源，存储在 ./shop-store） ----------

/**
 * 当前经营店铺：取本地记忆，要求仍是我的 ACTIVE 店铺；否则落到第一家 ACTIVE 店。
 * 商品/店员等卖家侧页面都以它为上下文（请求头 X-Shop-Id 由 SDK client 自动注入）。
 */
export function useCurrentShop(): ShopResponse | undefined {
    const shopId = useSyncExternalStore(subscribe, getStoredShopId, () => undefined)
    const shops = useMyShops()
    const actives = shops.data?.filter((s) => s.status === "ACTIVE") ?? []
    const shop = actives.find((s) => s.id === shopId) ?? actives[0] ?? undefined
    syncResolvedShopId(shop?.id)
    return shop
}
