import { useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"

import type { ShopResponse } from "@shop/api/sdk"

import { myShops } from "./data"
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

// ---------- 我的店铺列表 ----------

export function useMyShops() {
    const status = useAuthStatus()
    return useQuery({
        queryKey: shopKeys.mine(),
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
