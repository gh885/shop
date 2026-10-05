import { compactCount, type Money, sameMoney, strikethroughPrice } from "@shop/common/domain"
import type { AppLocale } from "@shop/common/i18n"
import type { ParamItem, PublicSkuResponse, SpecItem } from "@shop/api/sdk"

/**
 * product —— 买家侧商品领域层（纯类型 + 纯规则，不碰 React / 网络；wire → 投影在 ./mapper.ts）。
 *
 * 金额一律 Money（分 + 币种），不裸传 number；后端已直接差分 Money 对象（币种含在 Money 里），投影直接透传。
 */

// 业务类型
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
    /** 累计销量（已完成订单成交件数，后端投影列）。0 = 从没卖过，文案层不显示 */
    soldCount: number
}

/**
 * SKU 业务形状：直接用 SDK `PublicSkuResponse`，不造镜像类型。
 *
 * 契约上 `image` 为 null 表示无专属图（回退主图），`originalPrice` 为 null 表示没有划线价
 * （详情页不画那行删除线）——都可空如实透传，没有需要归一的字段，所以不做投影。
 */
export type Sku = PublicSkuResponse

/** 商品详情：内嵌 wire → 业务塑形后的 product（sku 与契约同形直接透传），渲染层无需再判空 */
export type ProductDetail = {
    product: Product
    /** 七天无理由退货的商品声明（详情页服务承诺的来源，也是下单快照进订单项的那一位）。
     *  不并进 `Product`：列表卡与 feed 卡都不讲服务承诺，为一个徽章扩两个契约不划算 */
    sevenDayReturn: boolean
    /** 详情图流：对象存储 key 数组，按序铺开渲染（代替富文本 HTML）；展示时用 imgUrl 拼 CDN 域名 */
    detailImages: string[]
    images: string[]
    specs: SpecItem[]
    params: ParamItem[]
    skus: Sku[]
}

// 列表查询入参
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

// 规格选择
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

// 价格 / 库存展示
export interface PriceView {
    /** 主价：选全规格 → SKU 价；未选全 → 价格区间下限。
     * 给 Money 而非元字符串也不拆 amount/currency，展示层经共享 Price 组件分段排版 */
    primary: Money
    /** 区间上限：与 primary 相同则不显示区间（undefined） */
    rangeTo?: Money
    /** 划线价：仅选中 SKU 且原价确实高于成交价时给（相等是不打折，画出来就是假折扣） */
    original?: Money
}

/** 价格展示策略：优先选中 SKU 的价，未选全回退商品价格区间（priceMin/priceMax） */
export function derivePriceView(detail: ProductDetail, selection: SkuSelection): PriceView {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) {
        return {
            primary: matched.price,
            original: strikethroughPrice(matched.originalPrice, matched.price),
        }
    }

    const { priceMin, priceMax } = detail.product
    return {
        primary: priceMin,
        rangeTo: sameMoney(priceMin, priceMax) ? undefined : priceMax,
    }
}

/**
 * 库存视图：§8（纯函数不出句子）返回 **catalog key + 渲染数据**，句子在渲染边界用 `t()` 拼。
 * 精确库存那条带 `{stock}`（件数是渲染数据，不是文案），其余三条无参。
 * 调用点对 `key` 做判别后 `t(key[, { stock }])`，与 `couponTimeReasonHint` 同一做法。
 */
export type StockView =
    | { key: "web.product.stock.inStock"; stock: number }
    | { key: "web.product.stock.soldOut" }
    | { key: "web.product.stock.inStockGeneric" }
    | { key: "web.product.stock.outOfStock" }

/** 库存视图：选中 SKU → 精确库存（0 显示售罄）；未选 → 任一 SKU 有货即「有货」 */
export function deriveStockText(detail: ProductDetail, selection: SkuSelection): StockView {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) {
        return matched.stock > 0
            ? { key: "web.product.stock.inStock", stock: matched.stock }
            : { key: "web.product.stock.soldOut" }
    }
    return detail.skus.some((s) => s.stock > 0)
        ? { key: "web.product.stock.inStockGeneric" }
        : { key: "web.product.stock.outOfStock" }
}

/** 商品卡片视图投影（首页 feed/推荐流/搜索/类目通用） */
export type ProductCardData = {
    id: string
    /** 主图：可空，无图时卡片用占位图 */
    image: string | null
    /** 商品标题 */
    title: string
    /** 起售价 */
    price: Money
    /** 销量的折位数字（不含「已售」那句），undefined = 这一格不画；句子由 ProductCard 用 t() 拼 */
    sales?: string
}

/**
 * 销量的折位文本：0 件不显示——「已售 0」是负资产，新品不必自证冷清；
 * 折位口径与收藏数共用一份（`compactCount`，PRD-68）。
 *
 * **只给数字，不给句子**：「已售 N」那句进 catalog（`t("web.product.sold")`，由 `ProductCard` 拼）——
 * `@shop/common` 不承载用户可见文案。`locale` 必填（§3.5 约束 2）。
 */
export function soldCountText(soldCount: number, locale: AppLocale): string | undefined {
    if (soldCount <= 0) return undefined
    return compactCount(soldCount, locale)
}

/** Product → 卡片视图投影（首页 feed 与详情页推荐流共用一份，不再各写一遍） */
export function toProductCardData(p: Product, locale: AppLocale): ProductCardData {
    return {
        id: p.id,
        image: p.image,
        title: p.title,
        price: p.priceMin,
        sales: soldCountText(p.soldCount, locale),
    }
}

/** 全部规格维度都已选择（有规格组时才允许加购/购买） */
export function isSelectionComplete(detail: ProductDetail, selection: SkuSelection): boolean {
    if (detail.specs.length === 0) return true
    return detail.specs.every((spec) => selection[spec.name] !== undefined)
}
