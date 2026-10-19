import { describe, expect, it } from "vite-plus/test"

import { money } from "@shop/common/domain"
import { makePublicProductResponse } from "@shop/test-utils/fixtures"
import { derivePriceView, type ProductDetail, type Sku } from "./rules"
import { toProduct } from "./mapper"

const MONEY = { amount: 1999, currency: "CNY" }

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
            ...toProduct(makePublicProductResponse()),
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
