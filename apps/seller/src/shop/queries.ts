import { useStore } from "zustand"
import { queryOptions, useQuery } from "@tanstack/react-query"

import { PublicShopsApi, ShopsApi, SubaccountAuthApi } from "@shop/api/sdk"

import { useAuthStatus } from "../shared/lib/api"
import { shopSelectionStore, syncResolvedShopId } from "../shared/lib/shop-store"
import { useSessionKind } from "../shared/lib/session-kind"
import type { ShopContextValue } from "./shop-context"

export { setCurrentShopId } from "../shared/lib/shop-store"

// shop 域 queryKey 工厂（前缀结构一眼可见，invalidate 不漏 key）
export const shopKeys = {
    all: ["shops"] as const,
    /** 店主自己的店（`/shops/mine`）：子账号会话**不打**这个接口，它只认买家令牌 */
    mine: () => ["shops", "mine"] as const,
    /** 子账号会话「我是谁、我在哪家店」（`/auth/subaccount/me`） */
    subaccountMe: () => ["shops", "subaccount", "me"] as const,
    /** 公开店读（`/api/shops/{id}`，匿名可达）：子账号拿店名与 logo 的唯一来源 */
    publicShop: (shopId: string) => ["shops", "public", shopId] as const,
    /** 本店子账号管理列表（店主专属，`/shops/{shopId}/subaccounts`） */
    subaccounts: (shopId: string) => ["shops", shopId, "subaccounts"] as const,
}

// queryOptions：key 与 queryFn 共置（失败冒到路由错误页，不再包 onRetry）
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

/**
 * 本店子账号列表：与商品的 shopId 入 key 同理——切店铺不串缓存。（子账号管理页 useQuery 直接消费）
 *
 * 它没有 `enabled` 门：进得来的只有店主，而 `/shops/{shopId}/subaccounts` 由后端按「是不是这家店的
 * 店主」把关（非店主 403，走全局错误通道）。
 */
export const subaccountsOptions = (shopId: string) =>
    queryOptions({
        queryKey: shopKeys.subaccounts(shopId),
        queryFn: () => ShopsApi.listSubaccounts({ path: { shopId } }),
    })

// 我的店铺列表
export function useMyShops() {
    const status = useAuthStatus()
    // 子账号会话下 `/shops/mine` 必 401（它只认买家令牌、且只返回店主自己的店），
    // 所以两种会话各取各的：这里对子账号直接不发请求，而不是发出去等一个 401
    const subaccount = useSessionKind() === "subaccount"
    // 守卫在 requireAuth 之后渲染，enabled 恒真；失败由路由错误页接管
    return useQuery({ ...myShopsOptions, enabled: status === "authed" && !subaccount })
}

/**
 * **子账号**会话的店：它自带店铺，所以来源是「自述 + 公开店读」两跳 ——
 * `/auth/subaccount/me` 给出 `shopId`，再向 `/api/shops/{id}`（匿名可达）要店名。
 *
 * 前端没有「我的店铺列表」可挑，所以这一支里没有选择逻辑，只有「拿到了 / 还没拿到」。
 */
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

/**
 * **店主**会话的店：本地记忆的店要仍是自己的 ACTIVE 店，否则落到第一家。
 * 子账号会话下 `useMyShops` 自己不发请求（`/shops/mine` 必 401），所以这一支天然空转。
 */
function useOwnerShop(): { shop: ShopContextValue | undefined; isPending: boolean } {
    const shops = useMyShops()
    // 记忆的店铺选择：hooks 不许条件调用，所以两种会话都先读出来，只有这一支用它
    const selection = useStore(shopSelectionStore)

    const actives = shops.data?.filter((s) => s.status === "ACTIVE") ?? []
    const shop = actives.find((s) => s.id === selection) ?? actives[0] ?? undefined
    return { shop, isPending: shops.isPending }
}

/**
 * 当前经营店铺 + 「还没定下来」。
 *
 * 两种会话的**来源不同**，这不是可以合并的实现细节：店主看自己名下的店（`/shops/mine` + 本地记忆），
 * 子账号的店由令牌带来（自述的 `shopId` + 公开店读）。所以两支各是一个 hook，
 * 这里只做「按会话种类取哪一支」与「把结果同步给请求头用的当前店铺 id」。
 *
 * `isPending` 是守卫要的第三个状态：未定下来时既不能渲染业务页（拿不到 shopId），
 * 也不能判成「没有店」跳去开店引导——所以它必须和 `shop === undefined` 分开表达。
 */
export function useShopContext(): { shop: ShopContextValue | undefined; isPending: boolean } {
    const subaccount = useSessionKind() === "subaccount"
    const owner = useOwnerShop()
    const subaccountShop = useSubaccountShop()
    const resolved = subaccount ? subaccountShop : owner

    // 只同步内存里的「当前店铺」，不写 localStorage：子账号的店是令牌带来的、不是用户选过的，
    // 写进去会在下次店主登录时被当成记忆的店铺
    syncResolvedShopId(resolved.shop?.id)
    return resolved
}

/**
 * 当前经营店铺：商品/订单/子账号等卖家侧页面都以它为上下文（请求头 X-Shop-Id 由 SDK client 自动注入，
 * 子账号会话不注入——它自带店铺）。
 */
export function useCurrentShop(): ShopContextValue | undefined {
    return useShopContext().shop
}
