import { createContext, useContext, type ReactNode } from "react"

// 只收 id/name：子账号会话的店来自公开读（只有这几格），加字段会编译通过但运行时变 undefined
export interface ShopContextValue {
    id: string
    name: string
}

const ShopContext = createContext<ShopContextValue | undefined>(undefined)

export function ShopProvider({ shop, children }: { shop: ShopContextValue; children: ReactNode }) {
    return <ShopContext value={shop}>{children}</ShopContext>
}

export function useShop(): ShopContextValue {
    const shop = useContext(ShopContext)
    if (!shop) throw new Error("useShop 只能在 ShopGate 内使用（路由守卫保证店铺存在）")
    return shop
}
