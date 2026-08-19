import { useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"

import type { Shop } from "@shop/api"

import { shopApi } from "./api"
import { useAuthStatus } from "./auth"

// ---------- 我的店铺列表 ----------

export function useMyShops() {
    const status = useAuthStatus()
    return useQuery({
        queryKey: ["shops", "mine"],
        queryFn: () => shopApi.myShops(),
        enabled: status === "authed",
    })
}

// ---------- 当前店铺上下文（X-Shop-Id 的来源，localStorage 持久化） ----------

const STORAGE_KEY = "shop_seller_current_shop"

let stored = localStorage.getItem(STORAGE_KEY)

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function setCurrentShopId(shopId: string | null) {
    stored = shopId
    if (shopId) {
        localStorage.setItem(STORAGE_KEY, shopId)
    } else {
        localStorage.removeItem(STORAGE_KEY)
    }
    listeners.forEach((l) => l())
}

function getStored() {
    return stored
}

/**
 * 当前经营店铺：取本地记忆，要求仍是我的 ACTIVE 店铺；否则落到第一家 ACTIVE 店。
 * 商品/店员等卖家侧页面都以它为上下文（请求头 X-Shop-Id）。
 */
export function useCurrentShop(): Shop | null {
    const shopId = useSyncExternalStore(subscribe, getStored, () => null)
    const shops = useMyShops()
    const actives = shops.data?.filter((s) => s.status === "ACTIVE") ?? []
    return actives.find((s) => s.id === shopId) ?? actives[0] ?? null
}
