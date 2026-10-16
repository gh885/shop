import { queryOptions } from "@tanstack/react-query"
import { SellerOrdersApi } from "@shop/api/sdk"

// shopId 必须进 key：否则切店铺会串缓存（与 order/queries.ts 的 orderKeys 同一口径）
export const analyticsKeys = {
    all: ["analytics"] as const,
    dailySales: (shopId: string) => ["analytics", shopId, "daily-sales"] as const,
}

// 看板失败冒到路由错误页、由全局 throwOnError 默认接管，这里别补 throwOnError
export const dailySalesOptions = (shopId: string) =>
    queryOptions({
        queryKey: analyticsKeys.dailySales(shopId),
        queryFn: ({ signal }) => SellerOrdersApi.dailySales({ signal }),
    })
