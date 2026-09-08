import { type Money } from "@shop/common"
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
    /** SDK 可空，null 表示无副标题（UI 回退主标题） */
    subtitle: string | null
    /** 主图：SDK 可空，null 表示无图（UI 用占位图） */
    image: string | null
    priceMin: Money
    priceMax: Money
}

/** SKU 业务形状：image 为 null 表示无专属图（回退主图） */
export type Sku = {
    id: string
    name: string
    attributes: SkuAttr[]
    /** SDK 可空，null 表示无专属图 */
    image: string | null
    price: Money
    originalPrice: Money
    stock: number
}

/** 商品详情：内嵌已塑形的 product/sku，异常字段 undefined 归一成空值，渲染层无需再判空 */
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
type ProductSort = "newest" | "price_asc" | "price_desc"

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

/** wire → 业务形状：required 字段不再兜底；subtitle/mainImage 可空如实透传 null */
export function toProduct(dto: PublicProductResponse): Product {
    return {
        id: dto.id,
        shopId: dto.shopId,
        categoryId: dto.categoryId,
        title: dto.name,
        subtitle: dto.subtitle,
        image: dto.mainImage,
        priceMin: dto.minPrice,
        priceMax: dto.maxPrice,
    }
}

/** wire → 业务形状：SKU 字段均已 required 且 Money 非 null，原样透传 */
function toSku(dto: PublicSkuResponse): Sku {
    return {
        id: dto.id,
        name: dto.name,
        attributes: dto.attributes,
        image: dto.image,
        price: dto.price,
        originalPrice: dto.originalPrice,
        stock: dto.stock,
    }
}

/** 详情 wire：detailImages/images/specs/params 在详情响应顶层（product 只是列表项），SKU 逐条 toSku */
export function toProductDetail(dto: PublicProductDetailResponse): ProductDetail {
    return {
        product: toProduct(dto.product),
        detailImages: dto.detailImages,
        images: dto.images,
        specs: dto.specs,
        params: dto.params,
        skus: dto.skus.map(toSku),
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
    const sku = skus.find((s) => s.attributes.some((a) => a.name === specName && a.value === value))
    return sku?.image ?? undefined
}

/** 规格组是否用图片卡渲染：任一值有 SKU 专属图即整组升级（对齐淘宝「分册名」图片卡） */
export function isImageSpecGroup(skus: Sku[], spec: SpecItem): boolean {
    return spec.values.some((v) => specValueImage(skus, spec.name, v.value) !== undefined)
}

// ---------- 价格 / 库存展示 ----------

// 金额格式化用 @shop/api 的 fenToYuan（与 Money 契约同源），不在本模块重复定义

export interface PriceView {
    /** 主价（分）：选全规格 → SKU 价；未选全 → 价格区间下限。
     * 给分值而非元字符串，展示层经共享 Price 组件走 splitFen 分段排版 */
    primary: number
    /** 区间上限（分）：与 primary 相同则不显示区间（undefined） */
    rangeTo?: number
    /** 划线价（分）：仅选中 SKU 且有 originalPrice 时给 */
    original?: number
    /** 币种（当前只有 CNY，透传给展示层备用） */
    currency: string
}

/** 价格展示策略：优先选中 SKU 的价，未选全回退商品价格区间（priceMin/priceMax） */
export function derivePriceView(detail: ProductDetail, selection: SkuSelection): PriceView {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) {
        return {
            primary: matched.price.amount,
            original: matched.originalPrice.amount,
            currency: matched.price.currency,
        }
    }

    const { priceMin, priceMax } = detail.product
    return {
        primary: priceMin.amount,
        rangeTo: priceMax.amount === priceMin.amount ? undefined : priceMax.amount,
        currency: priceMin.currency,
    }
}

/** 库存文案：选中 SKU → 精确库存（0 显示售罄）；未选 → 任一 SKU 有货即「有货」 */
export function deriveStockText(detail: ProductDetail, selection: SkuSelection): string {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) return matched.stock > 0 ? `库存 ${matched.stock} 件` : "该规格已售罄"
    return detail.skus.some((s) => s.stock > 0) ? "有货" : "暂时缺货"
}

/** 商品卡片视图投影（首页 feed/推荐流/搜索/类目通用）：金额按分给展示层拆分 */
export type ProductCardData = {
    id: string
    /** 主图：可空，无图时卡片用占位图 */
    image: string | null
    /** 商品标题 */
    title: string
    /** 价格（分） */
    price: number
    /** 销量描述。后端 ProductResponse 暂未提供 sales 聚合字段，接上后直接给 */
    sales?: string
    /** 标签排，如 自营 / 放心购 */
    tags?: string[]
}

/** Product → 卡片视图投影（首页 feed 与详情页推荐流共用一份，不再各写一遍） */
export function toProductCardData(p: Product): ProductCardData {
    return { id: p.id, image: p.image, title: p.title, price: p.priceMin.amount }
}

/** 全部规格维度都已选择（有规格组时才允许加购/购买） */
export function isSelectionComplete(detail: ProductDetail, selection: SkuSelection): boolean {
    if (detail.specs.length === 0) return true
    return detail.specs.every((spec) => selection[spec.name] !== undefined)
}
