import { useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"

import type { ShopResponse } from "@shop/api/sdk"

import { myShops } from "./shop-data"
import { useAuthStatus } from "./api"
import { getStoredShopId, subscribe, syncResolvedShopId } from "./shop-store"

export { setCurrentShopId, getCurrentShopId } from "./shop-store"

// ---------- 我的店铺列表 ----------

export function useMyShops() {
    const status = useAuthStatus()
    return useQuery({
        queryKey: ["shops", "mine"],
        queryFn: () => myShops(),
        enabled: status === "authed",
    })
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
