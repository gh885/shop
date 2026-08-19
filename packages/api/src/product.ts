import { z } from "zod"
import type { KyInstance } from "ky"

import {
    CategoryNodeSchema,
    PageResultSchema,
    ProductDetailSchema,
    ProductSchema,
    SkuSchema,
    type CategoryNode,
    type CreateProductRequest,
    type Product,
    type ProductDetail,
    type Sku,
    type SkuUpdateItem,
    type SpecItem,
    type UpdateProductRequest,
} from "./schemas/product"

/** 卖家侧商品/类目 API。店铺上下文经 X-Shop-Id 头注入（后端 ShopMembershipFilter 校验成员身份） */
export function createProductApi(api: KyInstance) {
    /** 带店铺上下文的请求头 */
    const shopHeaders = (shopId: string) => ({ "X-Shop-Id": shopId })

    return {
        /** 商品分页列表：按状态/名称筛选 */
        async list(
            shopId: string,
            params: { page: number; size: number; status?: number; keyword?: string },
        ): Promise<{ records: Product[]; total: number }> {
            return PageResultSchema(ProductSchema).parse(
                await api
                    .get("seller/products", {
                        headers: shopHeaders(shopId),
                        searchParams: {
                            page: params.page,
                            size: params.size,
                            ...(params.status === undefined ? {} : { status: params.status }),
                            ...(params.keyword ? { keyword: params.keyword } : {}),
                        },
                    })
                    .json(),
            )
        },

        /** 商品详情：SPU 全字段 + 全部 SKU */
        async detail(shopId: string, id: string): Promise<ProductDetail> {
            return ProductDetailSchema.parse(
                await api.get(`seller/products/${id}`, { headers: shopHeaders(shopId) }).json(),
            )
        },

        /** 创建商品草稿 */
        async create(shopId: string, data: CreateProductRequest): Promise<Product> {
            return ProductSchema.parse(
                await api
                    .post("seller/products", { headers: shopHeaders(shopId), json: data })
                    .json(),
            )
        },

        /** 编辑基本信息（specs/SKU 之外的字段） */
        async updateBasic(
            shopId: string,
            id: string,
            data: UpdateProductRequest,
        ): Promise<Product> {
            return ProductSchema.parse(
                await api
                    .put(`seller/products/${id}`, { headers: shopHeaders(shopId), json: data })
                    .json(),
            )
        },

        /** 更新规格模板并按新模板对账 SKU，返回当前全部 SKU */
        async updateSpecs(shopId: string, id: string, specs: SpecItem[]): Promise<Sku[]> {
            return z.array(SkuSchema).parse(
                await api
                    .put(`seller/products/${id}/specs`, {
                        headers: shopHeaders(shopId),
                        json: { specs },
                    })
                    .json(),
            )
        },

        /** 批量更新 SKU 价格/库存 */
        async updateSkus(shopId: string, id: string, items: SkuUpdateItem[]): Promise<Sku[]> {
            return z.array(SkuSchema).parse(
                await api
                    .put(`seller/products/${id}/skus`, {
                        headers: shopHeaders(shopId),
                        json: { items },
                    })
                    .json(),
            )
        },

        /** 发布草稿 */
        async publish(shopId: string, id: string): Promise<Product> {
            return ProductSchema.parse(
                await api
                    .post(`seller/products/${id}/publish`, { headers: shopHeaders(shopId) })
                    .json(),
            )
        },

        /** 下架 */
        async off(shopId: string, id: string): Promise<Product> {
            return ProductSchema.parse(
                await api
                    .post(`seller/products/${id}/off`, { headers: shopHeaders(shopId) })
                    .json(),
            )
        },

        /** 重新上架 */
        async on(shopId: string, id: string): Promise<Product> {
            return ProductSchema.parse(
                await api.post(`seller/products/${id}/on`, { headers: shopHeaders(shopId) }).json(),
            )
        },

        /** 前台类目树（全量返回，前端缓存） */
        async categoryTree(): Promise<CategoryNode[]> {
            return z.array(CategoryNodeSchema).parse(await api.get("api/categories/tree").json())
        },
    }
}
