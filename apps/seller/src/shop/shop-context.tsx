import { createContext, useContext, type ReactNode } from "react"

/**
 * 工作台里的「当前经营店铺」——**只要渲染子树真的用到的那两格**。
 *
 * 不直接用契约的 `ShopResponse`：子账号会话下店的来源是公开读（`/api/shops/{id}`，
 * 只有 id/name/logoKey/createdAt），而店主会话是 `/shops/mine`（多 ownerId/status/updatedAt/
 * rejectReason）。两者共有的就是这两格，页面实际读的也只有这两格——把上下文收窄到公共面，
 * 「子账号少了 status 字段」就从运行时事故变成了编译期不成立。
 */
export interface ShopContextValue {
    id: string
    name: string
}

const ShopContext = createContext<ShopContextValue | undefined>(undefined)

/** 由 ShopGate（路由守卫）注入：渲染子树时才提供 */
export function ShopProvider({ shop, children }: { shop: ShopContextValue; children: ReactNode }) {
    return <ShopContext value={shop}>{children}</ShopContext>
}

/**
 * 当前经营店铺（非空）。
 *
 * 只允许在 ShopGate 守卫内的组件使用——守卫保证渲染子树时必有 ACTIVE 店铺，
 * 所以这里不返回 undefined。守卫外的代码误用会直接 throw，而不是静默拿到 undefined
 * 一路带歪 key / enabled。
 */
export function useShop(): ShopContextValue {
    const shop = useContext(ShopContext)
    if (!shop) throw new Error("useShop 只能在 ShopGate 内使用（路由守卫保证店铺存在）")
    return shop
}
