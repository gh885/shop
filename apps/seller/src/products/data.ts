import { unwrap } from "@shop/api"
import {
    CategoriesApi,
    ProductsAdminApi,
    type CreateProductRequest,
    type ProductDetailResponse,
    type ProductResponse,
    type SkuResponse,
    type SkuUpdateItem,
    type UpdateProductRequest,
} from "@shop/api/sdk"

// ---------- 商品域数据函数（直接在调用点用，不经集中封装对象） ----------

/** seller 商品域请求以当前经营店铺为上下文，后端经 X-Shop-Id 头识别 */
const shopHeader = (shopId: string): { "X-Shop-Id": string } => ({ "X-Shop-Id": shopId })

/**
 * 店铺商品分页列表：wire → 领域形状（非空/字面量状态）。
 */
export async function listProducts(
    shopId: string,
    search: { page: number; size: number; status?: ProductResponse["status"]; keyword?: string },
): Promise<{ records: ProductResponse[]; total: number }> {
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
        records: page.records ?? [],
        total: page.total ?? 0,
    }
}

/** 商品详情（基本信息 + SKU 列表）：wire → 领域形状 */
export async function productDetail(shopId: string, id: string): Promise<ProductDetailResponse> {
    return unwrap(
        await ProductsAdminApi.getShopProductDetail({
            path: { id },
            headers: shopHeader(shopId),
        }),
    )
}

/** 新建草稿商品：wire → 领域形状 */
export async function createProduct(shopId: string, payload: CreateProductRequest) {
    return unwrap(
        await ProductsAdminApi.createProduct({
            body: payload,
            headers: shopHeader(shopId),
        }),
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

/** 编辑商品基本信息（autosave 用）：草稿阶段 name 可空 */
export async function updateProduct(shopId: string, id: string, payload: UpdateProductRequest) {
    return unwrap(
        await ProductsAdminApi.updateProduct({
            path: { id },
            body: payload,
            headers: shopHeader(shopId),
        }),
    )
}

/** 放弃草稿（仅 DRAFT 可删，同事务清 SKU+库存） */
export async function abandonProduct(shopId: string, id: string) {
    unwrap(
        await ProductsAdminApi.abandonProduct({
            path: { id },
            headers: shopHeader(shopId),
        }),
    )
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
    return unwrap(await CategoriesApi.getCategoryTree())
}

/**
 * 商品图上传：取七牛直传凭证 → 浏览器直传（不经过应用服务器）→ 返回公网 URL 供入库。
 * 直传成功后该 key 的 URL 即产品的 images / mainImage / 取值图值。
 */
export async function uploadProductImage(file: File): Promise<string> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    const ticket = unwrap(await ProductsAdminApi.issueImageTicket({ query: { ext } }))
    if (!ticket.uploadUrl || !ticket.token || !ticket.url) throw new Error("图片上传凭证缺失")
    const res = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { Authorization: `UpToken ${ticket.token}` },
        body: file,
    })
    if (!res.ok) throw new Error("图片直传七牛失败")
    return ticket.url
}

/** 类目属性模板（公开接口），发布页取销售属性（kind=SPEC）用 */
export async function attrTemplate(categoryId: string): Promise<CategoryAttrTemplateNode[]> {
    const nodes = unwrap(
        await CategoriesApi.getPublicCategoryAttrTemplate({ path: { id: categoryId } }),
    )
    return (nodes ?? []) as CategoryAttrTemplateNode[]
}

// ---------- 商品域类型（就近放在数据函数旁） ----------

/** 一个销售属性维度的选择：attrId 定位模板属性，valueIds 选值域内值，customValues 提交值域外新值 */
export interface SpecSelection {
    attrId: string
    valueIds: string[]
    customValues: string[]
    /** 模板取值（valueId）→ 取值图 */
    valueImages?: Record<string, string>
    /** 自定义取值文本 → 取值图 */
    customValueImages?: Record<string, string>
}

export interface CategoryAttrTemplateAttr {
    id: string
    categoryId: string
    name: string
    /** SPEC 销售属性 / PARAM 非销售参数 */
    kind: "SPEC" | "PARAM"
    required: boolean
    allowCustom: boolean
    /** 该规格是否允许每个取值上传配图 */
    allowImage: boolean
    sort: number
    status: "DISABLED" | "ENABLED"
    createdAt: string
    updatedAt: string
}

export interface CategoryAttrTemplateValue {
    id: string
    attrId: string
    value: string
    /** 规格值默认图（如「红色」对应色卡图），可空 */
    image?: string
    sort: number
    /** PLATFORM 平台预置 / SELLER 卖家扩充 */
    source: "PLATFORM" | "SELLER"
    createdAt: string
}

export interface CategoryAttrTemplateNode {
    attr: CategoryAttrTemplateAttr
    values: CategoryAttrTemplateValue[]
}
