import { useStore } from "zustand"
import { queryOptions, useQuery } from "@tanstack/react-query"

import { PublicShopsApi, ShopsApi, SubaccountAuthApi } from "@shop/api/sdk"

import { useAuthStatus } from "../shared/lib/api"
import { shopSelectionStore, syncResolvedShopId } from "../shared/lib/shop-store"
import { useSessionKind } from "../shared/lib/session-kind"
import type { ShopContextValue } from "./shop-context"

export { setCurrentShopId } from "../shared/lib/shop-store"

export const shopKeys = {
    all: ["shops"] as const,
    // /shops/mine 只认买家令牌：子账号会话不打它，否则必 401
    mine: () => ["shops", "mine"] as const,
    subaccountMe: () => ["shops", "subaccount", "me"] as const,
    // 公开店读是子账号拿店名与 logo 的唯一来源（匿名可达）
    publicShop: (shopId: string) => ["shops", "public", shopId] as const,
    subaccounts: (shopId: string) => ["shops", shopId, "subaccounts"] as const,
}

const myShopsOptions = queryOptions({
    queryKey: shopKeys.mine(),
    queryFn: () => ShopsApi.listMyShops(),
})

const subaccountMeOptions = queryOptions({
    queryKey: shopKeys.subaccountMe(),
    queryFn: () => SubaccountAuthApi.getSubaccountMe(),
})

const publicShopOptions = (shopId: string) =>
    queryOptions({
        queryKey: shopKeys.publicShop(shopId),
        queryFn: () => PublicShopsApi.getPublicShop({ path: { id: shopId } }),
    })

// 没有 enabled 门：进得来的只有店主，非店主由后端按「是不是这家店的店主」拿 403 把关
export const subaccountsOptions = (shopId: string) =>
    queryOptions({
        queryKey: shopKeys.subaccounts(shopId),
        queryFn: () => ShopsApi.listSubaccounts({ path: { shopId } }),
    })

export function useMyShops() {
    const status = useAuthStatus()
    // 子账号会话对 /shops/mine 直接不发请求，而不是发出去等一个 401
    const subaccount = useSessionKind() === "subaccount"
    return useQuery({ ...myShopsOptions, enabled: status === "authed" && !subaccount })
}

// 子账号的店来自两跳：/auth/subaccount/me 给 shopId，再向 /api/shops/{id}（匿名可达）要店名
function useSubaccountShop(): { shop: ShopContextValue | undefined; isPending: boolean } {
    const status = useAuthStatus()
    const subaccount = useSessionKind() === "subaccount"
    const me = useQuery({
        ...subaccountMeOptions,
        enabled: status === "authed" && subaccount,
    })
    const ownShopId = me.data?.shopId
    const publicShop = useQuery({
        ...publicShopOptions(ownShopId ?? ""),
        enabled: Boolean(ownShopId),
    })

    const shop: ShopContextValue | undefined = publicShop.data
        ? { id: publicShop.data.id, name: publicShop.data.name }
        : undefined
    return {
        shop,
        isPending: me.isPending || (ownShopId !== undefined && publicShop.isPending),
    }
}

// 店主的店：本地记忆的店要仍是自己的 ACTIVE 店，否则落到第一家
function useOwnerShop(): { shop: ShopContextValue | undefined; isPending: boolean } {
    const shops = useMyShops()
    // 记忆的店铺选择：hooks 不许条件调用，所以两种会话都先读出来，只有这一支用它
    const selection = useStore(shopSelectionStore)

    const actives = shops.data?.filter((s) => s.status === "ACTIVE") ?? []
    const shop = actives.find((s) => s.id === selection) ?? actives[0] ?? undefined
    return { shop, isPending: shops.isPending }
}

// isPending 必须和 shop===undefined 分开表达：未定下来时既不能渲染业务页，也不能判成「没有店」跳开店引导
export function useShopContext(): { shop: ShopContextValue | undefined; isPending: boolean } {
    const subaccount = useSessionKind() === "subaccount"
    const owner = useOwnerShop()
    const subaccountShop = useSubaccountShop()
    const resolved = subaccount ? subaccountShop : owner

    // 只同步内存里的当前店铺、不写 localStorage：子账号的店是令牌带来的，写进去会被下次店主登录当成记忆
    syncResolvedShopId(resolved.shop?.id)
    return resolved
}

export function useCurrentShop(): ShopContextValue | undefined {
    return useShopContext().shop
}
