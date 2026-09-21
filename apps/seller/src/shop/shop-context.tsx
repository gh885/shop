import { createContext, useContext, type ReactNode } from "react"
import type { ShopResponse } from "@shop/api/sdk"

const ShopContext = createContext<ShopResponse | undefined>(undefined)

/** 由 ShopGate（路由守卫）注入：渲染子树时才提供 */
export function ShopProvider({ shop, children }: { shop: ShopResponse; children: ReactNode }) {
    return <ShopContext value={shop}>{children}</ShopContext>
}

/**
 * 当前经营店铺（非空）。
 *
 * 只允许在 ShopGate 守卫内的组件使用——守卫保证渲染子树时必有 ACTIVE 店铺，
 * 所以这里不返回 undefined。守卫外的代码误用会直接 throw，而不是静默拿到 undefined
 * 一路带歪 key / enabled。
 */
export function useShop(): ShopResponse {
    const shop = useContext(ShopContext)
    if (!shop) throw new Error("useShop 只能在 ShopGate 内使用（路由守卫保证店铺存在）")
    return shop
}
