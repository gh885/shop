import { queryOptions, useQuery } from "@tanstack/react-query"

import { SellerMeControllerApi } from "@shop/api/sdk"

import { useAuthStatus } from "../../shared/lib/api"
import type { ShopContextValue } from "./shop-context"

/**
 * 当前卖家身份（`GET /api/seller/me`）。一家店一个账号——新后端没有多店与子账号，
 * 令牌里只有 merchantId，店铺由后端按商家查出。
 */
export const shopKeys = {
    all: ["seller", "me"] as const,
}

const sellerMeOptions = queryOptions({
    queryKey: shopKeys.all,
    queryFn: () => SellerMeControllerApi.sellerMe(),
})

export function useSellerMe() {
    const status = useAuthStatus()
    return useQuery({ ...sellerMeOptions, enabled: status === "authed" })
}

/**
 * isPending 必须和 shop===undefined 分开表达：未定下来时既不能渲染业务页，
 * 也不能判成「没有店」去跳开店引导。
 */
export function useShopContext(): { shop: ShopContextValue | undefined; isPending: boolean } {
    const me = useSellerMe()
    const shop: ShopContextValue | undefined =
        me.data?.shopId && me.data.shopName
            ? { id: me.data.shopId, name: me.data.shopName }
            : undefined
    return { shop, isPending: me.isPending }
}

export function useCurrentShop(): ShopContextValue | undefined {
    return useShopContext().shop
}
