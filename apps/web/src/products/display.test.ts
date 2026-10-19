import { describe, expect, it } from "vite-plus/test"

import { makeFeedItemResponse } from "@shop/test-utils/fixtures"

import { toProduct } from "./mapper"
import { soldCountText, toProductCardData } from "./display"

const MONEY = { amount: 1999, currency: "CNY" }

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
        const sold = toProductCardData(
            toProduct(makeFeedItemResponse({ soldCount: 12000 })),
            "zh-Hans-CN",
        )
        expect(sold.sales).toBe("1.2万")
        expect(sold.price).toEqual(MONEY)

        const fresh = toProductCardData(
            toProduct(makeFeedItemResponse({ soldCount: 0 })),
            "zh-Hans-CN",
        )
        expect(fresh.sales).toBeUndefined()
    })
})
