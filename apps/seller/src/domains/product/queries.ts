import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { SellerProductEditControllerApi } from "@shop/api/sdk"
import type { ToastText } from "@shop/app-kit/data"

import type { ProductListSearch } from "./search"

// 卖家商品列表的展示态词表在 order/constants（与后端 SellerProductQuery.STATUSES 逐字一致）
export const productKeys = {
    all: ["products"] as const,
    lists: (shopId: string) => [...productKeys.all, shopId] as const,
    list: (shopId: string, s: ProductListSearch) =>
        [...productKeys.lists(shopId), s.status ?? "all", s.keyword ?? "", s.cursor ?? ""] as const,
    detail: (id: string) => [...productKeys.all, "detail", id] as const,
}

// shopId 入 key：切店铺不串缓存；带 placeholderData 不能走 suspense，失败冒到路由错误页由全局默认接管
export const productListOptions = (shopId: string, s: ProductListSearch) =>
    queryOptions({
        queryKey: productKeys.list(shopId, s),
        // 透传 signal：筛选/翻页换 key 后，旧请求不该留在后端跑完
        queryFn: ({ signal }) =>
            SellerProductEditControllerApi.listProducts({
                query: { status: s.status, keyword: s.keyword, cursor: s.cursor, limit: s.size },
                signal,
            }),
        placeholderData: (prev) => prev,
    })

// 详情取数两版共用一句；retry:false = 详情一次定成败，不靠自动重试掩盖偶发失败
const fetchProductDetail = (id: string) =>
    SellerProductEditControllerApi.productDetail({ path: { spuId: id } })

// 同一份 queryKey（缓存/失效共用），去 skipToken：useSuspenseQuery 不接受 enabled/skipToken
export const productDetailSuspenseOptions = (productId: string) =>
    queryOptions({
        queryKey: productKeys.detail(productId),
        queryFn: () => fetchProductDetail(productId),
        retry: false,
    })

/** 编辑 SKU 后只失效当前商品详情；列表刷新与关闭弹窗由 onSaved 通知消费方。 */
export function useUpdateProductSkus(success: ToastText, onSaved: () => void) {
    return useMutation({
        mutationFn: ({
            productId,
            items,
        }: {
            productId: string
            items: {
                skuId: string
                price: { amount: number; currency: string }
                weightG?: number
                status: string
            }[]
        }) =>
            SellerProductEditControllerApi.updateSkus({ path: { spuId: productId }, body: items }),
        meta: { success, error: message("product.toast.saveFailed") },
        // 详情 key 含 productId（由变量算出），静态 meta 装不下 → 走库自己的 onSuccess
        onSuccess: (_data, { productId }, _ctx, { client }) => {
            void client.invalidateQueries({ queryKey: productKeys.detail(productId) })
            onSaved()
        },
    })
}
