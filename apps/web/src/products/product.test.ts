import { describe, expect, it } from "vite-plus/test"

import type { FeedItemResponse, PublicProductResponse } from "@shop/api/sdk"
import { money } from "@shop/common/domain"
import {
    derivePriceView,
    soldCountText,
    type ProductDetail,
    type Sku,
    toProductCardData,
} from "./product"
import { toProduct } from "./mapper"

/**
 * 卡片投影与销量文案：文案边界（0 / 9999 / 一万）错一格，全站商品卡要么集体显示「已售 0」，
 * 要么把 9999 写成「已售 1万」。价格视图（区间 / 划线价该不该出现）是纯投影，判据只放
 * derivePriceView 一处。
 *
 * 不测「列表契约与 feed 契约进同一个投影」：feedItem() 就是展开 publicProduct()，两条输入相同，
 * 比较同一函数的两次结果证明不了任何契约差异。真正的 feed 差异由两端各自的投影测试盯着。
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

/**
 * 销量的折位文本。**「已售 N」那句已经不在这一层**（进 catalog 的 `web.product.sold`，由 ProductCard
 * 用 t() 拼）——这里只钉折位数字的接线与那条「0 件不画」的边界，折位口径本身在 common 的 compactCount。
 */
describe("soldCountText", () => {
    it("没卖过_不显示", () => {
        expect(soldCountText(0, "zh-CN")).toBeUndefined()
    })

    it("负数（脏数据）_同样不显示", () => {
        expect(soldCountText(-1, "zh-CN")).toBeUndefined()
    })

    it("一万以下_原样给件数", () => {
        expect(soldCountText(1, "zh-CN")).toBe("1")
        expect(soldCountText(9999, "zh-CN")).toBe("9999")
    })

    // 折万本身（1 万去尾、123456 → 12.3 万、英文出 K）归 @shop/common 的 compactCount，那里已钉；
    // 这里只证「委托 + locale 透传」这条接线，不在两处各跑一遍同一组数
    it("过万_交给折位口径（locale 跟着走）", () => {
        expect(soldCountText(10000, "zh-CN")).toBe("1万")
        expect(soldCountText(10000, "en-US")).toBe("10K")
    })
})

describe("toProductCardData", () => {
    it("销量随卡片投影带出_是折后的数字不是整句_0 件时该格不画", () => {
        const sold = toProductCardData(toProduct(feedItem({ soldCount: 12000 })), "zh-CN")
        expect(sold.sales).toBe("1.2万")
        expect(sold.price).toEqual(MONEY)

        const fresh = toProductCardData(toProduct(feedItem({ soldCount: 0 })), "zh-CN")
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
