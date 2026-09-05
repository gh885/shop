import { ProductsApi } from "@shop/api/sdk"

import {
    toProduct,
    toProductDetail,
    type Product,
    type ProductDetail,
    type ProductListQueryInput,
} from "./product"

/**
 * product/data —— 商品的数据层（纯异步函数，非 hook）。规则/类型在 ./product.ts。
 * 真正的 React 接线（queryOptions）都在各页面级 use-*（如 widgets/product-detail/queries、
 * widgets/home/queries）——商品列表/详情被首页商品流、详情推荐、类目/搜索等多处复用，
 * 不在模块内绑死 query key/缓存策略，由调用方决定。
 */

/** 全站商品分页：卡片流/推荐/类目/搜索共用，返回领域形状 */
export async function fetchProducts(
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

/** 商品详情：匿名可访问（公开页），返回领域形状 */
export async function fetchProductDetail(id: string, signal?: AbortSignal): Promise<ProductDetail> {
    return toProductDetail(await ProductsApi.getPublicProductDetail({ path: { id }, signal }))
}
