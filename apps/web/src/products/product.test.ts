import { describe, expect, it } from "vitest"

import type { FeedItemResponse, PublicProductResponse } from "@shop/api/sdk"
import { money } from "@shop/common"

import {
    derivePriceView,
    formatSoldText,
    type ProductDetail,
    type Sku,
    toProduct,
    toProductCardData,
} from "./product"

/**
 * 卡片投影与销量文案：文案边界（0 / 9999 / 一万）错一格，全站商品卡要么集体显示「已售 0」，
 * 要么把 9999 写成「已售 1万」。同时钉住 feed 与列表两个契约都能进同一个投影。
 * 价格视图（区间 / 划线价该不该出现）同样是纯投影，判据只放 derivePriceView 一处。
 */

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

describe("formatSoldText", () => {
    it("没卖过_不显示", () => {
        expect(formatSoldText(0)).toBeUndefined()
    })

    it("负数（脏数据）_同样不显示", () => {
        expect(formatSoldText(-1)).toBeUndefined()
    })

    it("一万以下_原样显示件数", () => {
        expect(formatSoldText(1)).toBe("已售 1")
        expect(formatSoldText(9999)).toBe("已售 9999")
    })

    it("一万整_去掉小数点写「1万」而不是「1.0万」", () => {
        expect(formatSoldText(10000)).toBe("已售 1万")
    })

    it("一万以上_折成一位小数的万", () => {
        expect(formatSoldText(12000)).toBe("已售 1.2万")
        expect(formatSoldText(123456)).toBe("已售 12.3万")
    })
})

describe("toProduct", () => {
    it("列表契约与 feed 契约_进同一个投影", () => {
        const fromList = toProduct(publicProduct({ id: "a", soldCount: 7 }))
        const fromFeed = toProduct(feedItem({ id: "a", soldCount: 7 }))

        expect(fromFeed).toEqual(fromList)
        expect(fromFeed.soldCount).toBe(7)
    })
})

describe("toProductCardData", () => {
    it("销量随卡片投影带出_0 件时该格不画", () => {
        const sold = toProductCardData(toProduct(feedItem({ soldCount: 12000 })))
        expect(sold.sales).toBe("已售 1.2万")
        expect(sold.price).toEqual(MONEY)

        const fresh = toProductCardData(toProduct(feedItem({ soldCount: 0 })))
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
