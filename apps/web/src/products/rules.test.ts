import { ProductQuerySchema } from "@shop/api/schemas"
import { describe, expect, it } from "vite-plus/test"

import type { FeedItemResponse, PublicProductResponse } from "@shop/api/sdk"
import { money } from "@shop/common/domain"
import {
    derivePriceView,
    PRODUCT_SORT_VALUES,
    soldCountText,
    type ProductDetail,
    type Sku,
    toProductCardData,
} from "./rules"
import { toProduct } from "./mapper"

const MONEY = { amount: 1999, currency: "CNY" }

function publicProduct(overrides: Partial<PublicProductResponse> = {}): PublicProductResponse {
    return {
        id: "p1",
        shopId: "s1",
        categoryId: "c1",
        name: "测试商品",
        subtitle: null,
        mainImage: null,
        minPrice: MONEY,
        maxPrice: MONEY,
        soldCount: 0,
        sevenDayReturn: true,
        ...overrides,
    }
}

function feedItem(overrides: Partial<FeedItemResponse> = {}): FeedItemResponse {
    return { ...publicProduct(), ...overrides }
}

describe("soldCountText", () => {
    it("没卖过_不显示", () => {
        expect(soldCountText(0, "zh-Hans-CN")).toBeUndefined()
    })

    it("负数（脏数据）_同样不显示", () => {
        expect(soldCountText(-1, "zh-Hans-CN")).toBeUndefined()
    })

    it("一万以下_原样给件数", () => {
        expect(soldCountText(1, "zh-Hans-CN")).toBe("1")
        expect(soldCountText(9999, "zh-Hans-CN")).toBe("9999")
    })

    it("过万_交给折位口径（locale 跟着走）", () => {
        expect(soldCountText(10000, "zh-Hans-CN")).toBe("1万")
        expect(soldCountText(10000, "en-US")).toBe("10K")
    })
})

describe("toProductCardData", () => {
    it("销量随卡片投影带出_是折后的数字不是整句_0 件时该格不画", () => {
        const sold = toProductCardData(toProduct(feedItem({ soldCount: 12000 })), "zh-Hans-CN")
        expect(sold.sales).toBe("1.2万")
        expect(sold.price).toEqual(MONEY)

        const fresh = toProductCardData(toProduct(feedItem({ soldCount: 0 })), "zh-Hans-CN")
        expect(fresh.sales).toBeUndefined()
    })
})

function skuOf(price: number, originalPrice: number | null): Sku {
    return {
        id: "sku-1",
        name: "黑色 / 128G",
        attributes: [{ attrId: "a1", valueId: "v1", name: "颜色", value: "黑色" }],
        image: null,
        price: money(price),
        originalPrice: originalPrice === null ? null : money(originalPrice),
        stock: 5,
    }
}

function detailWith(opts: { priceMax?: number; skus?: Sku[] } = {}): ProductDetail {
    return {
        product: {
            ...toProduct(publicProduct()),
            priceMax: opts.priceMax === undefined ? MONEY : money(opts.priceMax),
        },
        sevenDayReturn: true,
        detailImages: [],
        images: [],
        specs: [],
        params: [],
        skus: opts.skus ?? [],
    }
}

describe("排序词表", () => {
    it("与契约那格 pattern 同源：后端加了排序方式而这里没跟，当场红", () => {
        // `ProductQuery.sort` 在契约里是 @Pattern("newest|price_asc|price_desc") 而不是 enum
        // ——前端拿不到结构化的词表，TS 也切不开一个字面量类型（见 product.ts 顶上那段），
        // 所以「与契约相等」只能由这条断言钉住，而不是靠类型。
        expect(PRODUCT_SORT_VALUES.join("|")).toBe(ProductQuerySchema.properties.sort.pattern)
    })
})

describe("derivePriceView", () => {
    it("选全规格取该 SKU 的价，划线价确实更高才给", () => {
        const view = derivePriceView(detailWith({ skus: [skuOf(1990, 2990)] }), { 颜色: "黑色" })

        expect(view.primary).toEqual(money(1990))
        expect(view.original).toEqual(money(2990))
    })

    it("划线价与成交价相等 ⇒ 不画：后端允许相等（PRD-39），但相等是「一分钱没让」", () => {
        expect(
            derivePriceView(detailWith({ skus: [skuOf(1990, 1990)] }), { 颜色: "黑色" }).original,
        ).toBeUndefined()
    })

    it("契约上就没有划线价 ⇒ 视图里也没有", () => {
        expect(
            derivePriceView(detailWith({ skus: [skuOf(1990, null)] }), { 颜色: "黑色" }).original,
        ).toBeUndefined()
    })

    it("未选规格走区间：上下限相同不给 rangeTo（同价不显示区间）", () => {
        expect(derivePriceView(detailWith(), {}).rangeTo).toBeUndefined()
        expect(derivePriceView(detailWith({ priceMax: 2990 }), {}).rangeTo).toEqual(money(2990))
    })
})
