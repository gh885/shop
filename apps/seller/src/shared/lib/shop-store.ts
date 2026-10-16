import { createStore } from "zustand/vanilla"

const STORAGE_KEY = "shop_seller_current_shop"

export const shopSelectionStore = createStore<string | undefined>(() =>
    typeof window === "undefined" ? undefined : (localStorage.getItem(STORAGE_KEY) ?? undefined),
)

// resolved 是当前请求实际用的店铺（含第一家 ACTIVE 兜底），刻意不进响应式 store：避免渲染期通知订阅者
let resolved = shopSelectionStore.getState()

export function setCurrentShopId(shopId: string | undefined) {
    resolved = shopId
    try {
        if (shopId) {
            localStorage.setItem(STORAGE_KEY, shopId)
        } else {
            localStorage.removeItem(STORAGE_KEY)
        }
    } finally {
        shopSelectionStore.setState(shopId, true)
    }
}

export function getCurrentShopId() {
    return resolved
}

export function syncResolvedShopId(shopId: string | undefined) {
    resolved = shopId
}
