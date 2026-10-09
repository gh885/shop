import { createStore } from "zustand/vanilla"

/** 与 shop/queries 分开，供 SDK 请求头读取，避免 api → queries → api 的依赖环。 */
const STORAGE_KEY = "shop_seller_current_shop"

/** 只保存用户显式选择的 ID；店铺实体仍由 TanStack Query 持有。 */
export const shopSelectionStore = createStore<string | undefined>(() =>
    typeof window === "undefined" ? undefined : (localStorage.getItem(STORAGE_KEY) ?? undefined),
)

/**
 * 当前请求实际使用的店铺（含第一家 ACTIVE 店兜底），不是用户的持久化选择。
 * useCurrentShop 在渲染子树前同步它；不放进响应式 store，避免渲染期通知订阅者。
 */
let resolved = shopSelectionStore.getState()

export function setCurrentShopId(shopId: string | undefined) {
    // 请求头先同步；即使浏览器拒绝持久化，登出也不能留下旧店铺的内存状态。
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

/** 当前店铺 id 的非 React 读取口（SDK client contextHeaders 用） */
export function getCurrentShopId() {
    return resolved
}

/** useCurrentShop 每次解析后同步（幂等赋值，非 React 状态） */
export function syncResolvedShopId(shopId: string | undefined) {
    resolved = shopId
}
