import { fenToYuan } from "@shop/api"
import type { Money } from "@shop/api"
import type { Money as SdkMoney } from "@shop/api/sdk"
import type {
    ParamItem,
    PublicProductDetailResponse,
    PublicProductResponse,
    PublicSkuResponse,
    SkuAttr,
    SpecItem,
} from "@shop/api/sdk"

/**
 * product —— 买家侧商品领域层（纯类型 + 纯规则 + wire → 投影，不碰 React / 网络）。
 *
 * 投影刻意做瘦：只暴露消费方真正需要的字段，wire 的可选字段归一成稳定缺省形状。
 * 金额一律 Money（分 + 币种），不裸传 number；后端已直接差分 Money 对象（币种含在 Money 里），投影直接透传。
 */

// ---------- 业务类型 ----------

/** 商品列表项：卡片/推荐流通用。价格区间保留 Money 由展示层决定拼不拼 */
export type Product = {
    id: string
    shopId: string
    categoryId: string
    title: string
    subtitle: string
    image: string
    priceMin: Money | null
    priceMax: Money | null
}

/** SKU 业务形状：attributes 空数组兜底；image 为 undefined 表示无专属图（回退主图）；stock 缺失按 0 售罄处理 */
export type Sku = {
    id: string
    name: string
    attributes: SkuAttr[]
    image?: string
    price: Money
    originalPrice: Money | null
    stock: number
}

/** 商品详情：内嵌已塑形的 product/sku，异常字段 null 归一成空值，渲染层无需再判空 */
export type ProductDetail = {
    product: Product
    /** 详情图流：对象存储 key 数组，按序铺开渲染（代替富文本 HTML）；展示时用 imgUrl 拼 CDN 域名 */
    detailImages: string[]
    images: string[]
    specs: SpecItem[]
    params: ParamItem[]
    skus: Sku[]
}

// ---------- 列表查询入参 ----------

/** 排序方式（与后端 ProductQuery 的 @Pattern 对齐，非法值后端 400） */
export type ProductSort = "newest" | "price_asc" | "price_desc"

/** 全站上架商品列表查询：字段全可选，page/size 有默认（分页上限 100 同后端 @Max） */
export type ProductListQuery = {
    page: number
    size: number
    categoryId?: string
    shopId?: string
    keyword?: string
    sort?: ProductSort
}

/** 入参形状（page/size 可省，走默认）与解析后形状分开 */
export type ProductListQueryInput = {
    page?: number
    size?: number
    categoryId?: string
    shopId?: string
    keyword?: string
    sort?: ProductSort
}

// ---------- wire → 投影 ----------

/** 归一：SDK 的 Money 字段全可选（openapi-ts 默认），业务 Money 必填；null 原样保留，否则回填默认币种。 */
function toMoney(m: SdkMoney | null | undefined): Money | null {
    if (m == null) return null
    return { amount: m.amount ?? 0, currency: m.currency ?? "CNY" }
}

/** wire → 业务形状：PublicProductResponse 可选字段归一；minPrice/maxPrice 已是 Money，归一成必填 Money */
export function toProduct(dto: PublicProductResponse): Product {
    return {
        id: dto.id ?? "",
        shopId: dto.shopId ?? "",
        categoryId: dto.categoryId ?? "",
        title: dto.name ?? "",
        subtitle: dto.subtitle ?? "",
        image: dto.mainImage ?? "",
        priceMin: toMoney(dto.minPrice),
        priceMax: toMoney(dto.maxPrice),
    }
}

/** wire → 业务形状：SKU 价/划线价已是 Money（币种已含在 Money 里），归一成必填 Money；price 缺省回 0 分 */
export function toSku(dto: PublicSkuResponse): Sku {
    return {
        id: dto.id ?? "",
        name: dto.name ?? "",
        attributes: dto.attributes ?? [],
        image: dto.image,
        price: toMoney(dto.price) ?? { amount: 0, currency: "CNY" },
        originalPrice: toMoney(dto.originalPrice),
        stock: dto.stock ?? 0,
    }
}

/** 详情 wire：detailImages/images/specs/params 在详情响应顶层（product 只是列表项），SKU 逐条 toSku */
export function toProductDetail(dto: PublicProductDetailResponse): ProductDetail {
    return {
        product: toProduct(dto.product ?? ({} as PublicProductResponse)),
        detailImages: dto.detailImages ?? [],
        images: dto.images ?? [],
        specs: dto.specs ?? [],
        params: dto.params ?? [],
        skus: (dto.skus ?? []).map(toSku),
    }
}

// ---------- 规格选择 ----------

/** 规格选择状态：维度名 → 已选值。未选的维度不出现在记录里（允许部分选择） */
export type SkuSelection = Record<string, string>

/** 按已选规格精确匹配 SKU：selection 里每个维度都命中该 SKU 的 attributes 才算 */
export function findMatchingSku(skus: Sku[], selection: SkuSelection): Sku | undefined {
    const entries = Object.entries(selection)
    if (entries.length === 0) return undefined
    return skus.find((sku) =>
        entries.every(([name, value]) =>
            sku.attributes.some((a) => a.name === name && a.value === value),
        ),
    )
}

/**
 * 某维度的某值在「当前已选其他维度」约束下是否可选：
 * 把该值代入后，存在 stock > 0 且其余已选维度也命中的 SKU 才可选（售罄组合置灰）。
 */
export function isValueAvailable(
    skus: Sku[],
    selection: SkuSelection,
    specName: string,
    value: string,
): boolean {
    const constrained: SkuSelection = { ...selection, [specName]: value }
    return skus.some(
        (sku) =>
            sku.stock > 0 &&
            Object.entries(constrained).every(([name, v]) =>
                sku.attributes.some((a) => a.name === name && a.value === v),
            ),
    )
}

/** 规格组的某个值对应的 SKU 专属图（取第一个命中），无则 undefined → 该组退化为文字丸 */
export function specValueImage(skus: Sku[], specName: string, value: string): string | undefined {
    return skus.find(
        (sku) =>
            sku.image !== undefined &&
            sku.attributes.some((a) => a.name === specName && a.value === value),
    )?.image
}

/** 规格组是否用图片卡渲染：任一值有 SKU 专属图即整组升级（对齐淘宝「分册名」图片卡） */
export function isImageSpecGroup(skus: Sku[], spec: SpecItem): boolean {
    return spec.values.some((v) => specValueImage(skus, spec.name, v.value) !== undefined)
}

// ---------- 价格 / 库存展示 ----------

// 金额格式化用 @shop/api 的 fenToYuan（与 Money 契约同源），不在本模块重复定义

export interface PriceView {
    /** 主价文案（元字符串）：选全规格 → SKU 价；未选全 → 价格区间下限 */
    primary: string
    /** 区间上限：与 primary 相同则不显示区间（undefined） */
    rangeTo?: string
    /** 划线价（元字符串）：仅选中 SKU 且有 originalPrice 时给 */
    original?: string
    /** 币种（当前只有 CNY，透传给展示层备用） */
    currency: string
}

/** 价格展示策略：优先选中 SKU 的价，未选全回退商品价格区间（priceMin/priceMax） */
export function derivePriceView(detail: ProductDetail, selection: SkuSelection): PriceView {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched?.price) {
        return {
            primary: fenToYuan(matched.price.amount),
            original: matched.originalPrice ? fenToYuan(matched.originalPrice.amount) : undefined,
            currency: matched.price.currency,
        }
    }

    const { priceMin, priceMax } = detail.product
    const from = priceMin ?? priceMax
    if (!from) return { primary: "0.00", currency: "CNY" }
    return {
        primary: fenToYuan(from.amount),
        rangeTo:
            priceMax && priceMax.amount !== from.amount ? fenToYuan(priceMax.amount) : undefined,
        currency: from.currency,
    }
}

/** 库存文案：选中 SKU → 精确库存（0 显示售罄）；未选 → 任一 SKU 有货即「有货」 */
export function deriveStockText(detail: ProductDetail, selection: SkuSelection): string {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) return matched.stock > 0 ? `库存 ${matched.stock} 件` : "该规格已售罄"
    return detail.skus.some((s) => s.stock > 0) ? "有货" : "暂时缺货"
}

/** 全部规格维度都已选择（有规格组时才允许加购/购买） */
export function isSelectionComplete(detail: ProductDetail, selection: SkuSelection): boolean {
    if (detail.specs.length === 0) return true
    return detail.specs.every((spec) => selection[spec.name] !== undefined)
}
