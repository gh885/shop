import { z } from "zod"

import { PageResultSchema } from "@shop/api"

import { publicApi } from "#/shared/api/public"

import {
    ProductDetailSchema,
    ProductListQuerySchema,
    ProductSchema,
    type Product,
    type ProductDetail,
    type ProductListQueryInput,
} from "./model"

/**
 * Product 数据层读命令（纯逻辑，不含 React Query / React）。
 * 公开接口匿名可访问（见后端 JwtProperties.skipPaths），SSR loader 与浏览器均可调。
 */

/** 商品 id 入参先过一遍 uuid 校验，防拼接进路径的脏串 */
const ProductIdSchema = z.uuid()

/** 全站上架商品分页：首页商品流 / 搜索 / 类目页共用 */
export async function fetchProducts(query: ProductListQueryInput = {}): Promise<{
    records: Product[]
    total: number
}> {
    const q = ProductListQuerySchema.parse(query)
    return PageResultSchema(ProductSchema).parse(
        await publicApi
            .get("api/products", {
                searchParams: {
                    page: q.page,
                    size: q.size,
                    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
                    ...(q.shopId ? { shopId: q.shopId } : {}),
                    ...(q.keyword ? { keyword: q.keyword } : {}),
                    ...(q.sort ? { sort: q.sort } : {}),
                },
            })
            .json(),
    )
}

/** 商品详情：不存在或非上架由后端 404（ky 抛 ApiError，调用方自行转 notFound） */
export async function fetchProductDetail(id: string): Promise<ProductDetail> {
    return ProductDetailSchema.parse(
        await publicApi.get(`api/products/${ProductIdSchema.parse(id)}`).json(),
    )
}
