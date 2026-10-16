import { queryOptions } from "@tanstack/react-query"
import { ProductsApi, PublicShopsApi } from "@shop/api/sdk"
import type { PublicShopResponse } from "@shop/api/sdk"

import { toProduct, toProductDetail } from "../mapper"
import type { Product, ProductDetail, ProductListQueryInput } from "../product"

async function fetchProducts(
    input: ProductListQueryInput,
    signal?: AbortSignal,
): Promise<{ records: Product[]; total: number }> {
    const page = await ProductsApi.listPublicProducts({
        query: {
            pageParams: { page: input.page ?? 1, size: input.size ?? 20 },
            query: {
                categoryId: input.categoryId,
                shopId: input.shopId,
                keyword: input.keyword,
                sort: input.sort,
            },
        },
        signal,
    })
    return {
        records: page.records.map(toProduct),
        total: page.total,
    }
}

async function fetchProductDetail(id: string, signal?: AbortSignal): Promise<ProductDetail> {
    return toProductDetail(await ProductsApi.getPublicProductDetail({ path: { id }, signal }))
}

const CACHE = 5 * 60_000

export const productDetailOptions = (id: string) =>
    queryOptions({
        queryKey: ["product-detail", id],
        queryFn: ({ signal }) => fetchProductDetail(id, signal),
        staleTime: CACHE,
        retry: false,
    })

type PublicShop = Pick<PublicShopResponse, "id" | "name"> & { logoKey?: string }

export const shopOptions = (shopId: string) =>
    queryOptions({
        queryKey: ["shop-public", shopId],
        queryFn: async ({ signal }): Promise<PublicShop> => {
            const d = await PublicShopsApi.getPublicShop({ path: { id: shopId }, signal })
            return { id: d.id, name: d.name, logoKey: d.logoKey ?? undefined }
        },
        staleTime: CACHE,
        retry: false,
    })

export const shopProductsOptions = (shopId: string) =>
    queryOptions({
        queryKey: ["shop-products", shopId],
        queryFn: ({ signal }) => fetchProducts({ page: 1, size: 11, shopId }, signal),
        staleTime: CACHE,
        retry: false,
    })

export const alsoViewedOptions = queryOptions({
    queryKey: ["also-viewed-products"],
    queryFn: ({ signal }) => fetchProducts({ page: 1, size: 11, sort: "newest" }, signal),
    staleTime: CACHE,
    retry: false,
})
