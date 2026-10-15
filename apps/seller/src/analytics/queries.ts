import { queryOptions } from "@tanstack/react-query"
import { SellerOrdersApi } from "@shop/api/sdk"

// 看板数据与「当前经营店铺」绑定：X-Shop-Id 由 SDK client 自动注入，业务代码不手设。
// shopId 入 key——切店铺不串缓存，与 order/queries.ts 的 orderKeys 同一口径。
// 它是订单的聚合派生，单开 analytics 前缀：失效订单不牵动看板，反之亦然。
export const analyticsKeys = {
    all: ["analytics"] as const,
    dailySales: (shopId: string) => ["analytics", shopId, "daily-sales"] as const,
}

/** 近 30 天每日销售额（卖家看板）：服务端按营业日补满 30 天，空档日金额为 0。
 *  页面主体数据，失败冒到路由错误页，由全局默认（throwOnError）接管，故不写 throwOnError。 */
export const dailySalesOptions = (shopId: string) =>
    queryOptions({
        queryKey: analyticsKeys.dailySales(shopId),
        queryFn: ({ signal }) => SellerOrdersApi.dailySales({ signal }),
    })
