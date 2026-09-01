import { unwrap } from "@shop/api"
import {
    CategoriesApi,
    ProductsAdminApi,
    type CreateProductRequest,
    type SkuResponse,
    type SkuUpdateItem,
} from "@shop/api/sdk"

import { toCategoryTree, toProduct, toProductDetail, type Product } from "#/domain"
import { tokenStore } from "#/shared/lib/api"

// ---------- 商品域数据函数（直接在调用点用，不经集中封装对象） ----------

/** seller 商品域请求以当前经营店铺为上下文，后端经 X-Shop-Id 头识别 */
const shopHeader = (shopId: string): { "X-Shop-Id": string } => ({ "X-Shop-Id": shopId })

/**
 * 店铺商品分页列表：wire → 领域形状（非空/字面量状态）。
 */
export async function listProducts(
    shopId: string,
    search: { page: number; size: number; status?: number; keyword?: string },
): Promise<{ records: Product[]; total: number }> {
    const page = unwrap(
        await ProductsAdminApi.listShopProducts({
            query: {
                pageParams: { page: search.page, size: search.size },
                status: search.status,
                keyword: search.keyword,
            },
            headers: shopHeader(shopId),
        }),
    )
    return {
        records: (page.records ?? []).map(toProduct),
        total: page.total ?? 0,
    }
}

/** 商品详情（基本信息 + SKU 列表）：wire → 领域形状 */
export async function productDetail(shopId: string, id: string) {
    return toProductDetail(
        unwrap(
            await ProductsAdminApi.getShopProductDetail({
                path: { id },
                headers: shopHeader(shopId),
            }),
        ),
    )
}

/** 新建草稿商品：wire → 领域形状 */
export async function createProduct(shopId: string, payload: CreateProductRequest) {
    return toProduct(
        unwrap(
            await ProductsAdminApi.createProduct({
                body: payload,
                headers: shopHeader(shopId),
            }),
        ),
    )
}

/** 更新 SKU 价格库存，返回更新后的 SKU 网格 */
export async function updateProductSkus(
    shopId: string,
    id: string,
    items: SkuUpdateItem[],
): Promise<SkuResponse[]> {
    const data = unwrap(
        await ProductsAdminApi.updateProductSkus({
            path: { id },
            body: { items },
            headers: shopHeader(shopId),
        }),
    )
    return data as SkuResponse[]
}

/** 应用销售属性选择 → 服务端按 valueId 组合对账 SKU，返回当前 SKU 网格（价格/库存留空待填） */
export async function applyProductSpecs(
    shopId: string,
    id: string,
    selections: SpecSelection[],
): Promise<SkuResponse[]> {
    const data = unwrap(
        await ProductsAdminApi.updateProductSpecs({
            path: { id },
            body: { specs: selections } as never,
            headers: shopHeader(shopId),
        }),
    )
    return data as unknown as SkuResponse[]
}

/** 发布（草稿 → 上架） */
export async function publishProduct(shopId: string, id: string) {
    unwrap(await ProductsAdminApi.publishProduct({ path: { id }, headers: shopHeader(shopId) }))
}

/** 下架 */
export async function offProduct(shopId: string, id: string) {
    unwrap(await ProductsAdminApi.offProduct({ path: { id }, headers: shopHeader(shopId) }))
}

/** 重新上架 */
export async function onProduct(shopId: string, id: string) {
    unwrap(await ProductsAdminApi.onProduct({ path: { id }, headers: shopHeader(shopId) }))
}

/** 类目树（末级可挂商品）：wire → 领域形状 */
export async function categoryTree() {
    return toCategoryTree(unwrap(await CategoriesApi.getCategoryTree()))
}

/** 类目属性模板（公开接口），发布页取销售属性（kind=1）用；带鉴权头避免误判 */
export async function attrTemplate(categoryId: string): Promise<CategoryAttrTemplateNode[]> {
    const token = tokenStore.get()
    const res = await fetch(`/api/categories/${categoryId}/attr-template`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!res.ok) throw new Error(`拉取类目属性模板失败(${res.status})`)
    return (await res.json()) as CategoryAttrTemplateNode[]
}

// ---------- 商品域类型（就近放在数据函数旁） ----------

/** 一个销售属性维度的选择：attrId 定位模板属性，valueIds 选值域内值，customValues 提交值域外新值 */
export interface SpecSelection {
    attrId: string
    valueIds: string[]
    customValues: string[]
}

export interface CategoryAttrTemplateAttr {
    id: string
    categoryId: string
    name: string
    /** 1 销售属性 / 2 非销售参数 */
    kind: number
    required: boolean
    allowCustom: boolean
    sort: number
    status: number
    createdAt: string
    updatedAt: string
}

export interface CategoryAttrTemplateValue {
    id: string
    attrId: string
    value: string
    sort: number
    /** 1 平台预置 / 2 卖家扩充 */
    source: number
    createdAt: string
}

export interface CategoryAttrTemplateNode {
    attr: CategoryAttrTemplateAttr
    values: CategoryAttrTemplateValue[]
}
