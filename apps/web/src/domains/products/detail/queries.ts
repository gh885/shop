import { queryOptions } from "@tanstack/react-query"
import { BuyerCatalogBrowseControllerApi, CatalogQueryControllerApi } from "@shop/api/sdk"

import { toProduct, toProductDetail } from "../mapper"
import type { Product, ProductDetail } from "../rules"

const CACHE = 5 * 60_000

export const productDetailOptions = (id: string) =>
    queryOptions({
        queryKey: ["product-detail", id],
        queryFn: async ({ signal }): Promise<ProductDetail> =>
            toProductDetail(
                await CatalogQueryControllerApi.product({ path: { spuId: id }, signal }),
            ),
        staleTime: CACHE,
        retry: false,
    })

/** 「看看最新」：契约没有「也看了」推荐端点，退化为最新商品流（module-map 记在案的降级路径） */
export const alsoViewedOptions = queryOptions({
    queryKey: ["also-viewed-products"],
    queryFn: async ({ signal }): Promise<Product[]> => {
        const page = await BuyerCatalogBrowseControllerApi.products({
            query: { limit: 12, sort: "newest" },
            signal,
        })
        return page.items.map(toProduct)
    },
    staleTime: CACHE,
    retry: false,
})
