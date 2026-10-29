import type { Money } from "@shop/common/domain"
import { describe, expect, it } from "vite-plus/test"

import { skuServerFieldMap } from "./EditSkuDialog"
import type { SkuTextRow } from "#/domains/product/draft-rules"

const CNY = (amount: number): Money => ({ amount, currency: "CNY" })

function row(overrides: Partial<SkuTextRow> & Pick<SkuTextRow, "skuId">): SkuTextRow {
    return {
        label: overrides.skuId,
        price: CNY(100),
        priceText: "1.00",
        weightText: "100",
        weight: 100,
        status: "online",
        ...overrides,
    }
}

describe("skuServerFieldMap（后端 items[i] → 弹窗 rows[j]）", () => {
    const rows = [row({ skuId: "sku-a" }), row({ skuId: "sku-b" }), row({ skuId: "sku-c" })]

    it("价格模式：一行一条不丢，下标就是行号；改的是价格（含金额列）", () => {
        expect(skuServerFieldMap("price", rows)).toEqual({
            "items[0].price": "rows[0].priceText",
            "items[0].price.amount": "rows[0].priceText",
            "items[1].price": "rows[1].priceText",
            "items[1].price.amount": "rows[1].priceText",
            "items[2].price": "rows[2].priceText",
            "items[2].price.amount": "rows[2].priceText",
        })
    })

    it("重量模式：一行一条重量映射", () => {
        expect(skuServerFieldMap("stock", rows)).toEqual({
            "items[0].weightG": "rows[0].weightText",
            "items[1].weightG": "rows[1].weightText",
            "items[2].weightG": "rows[2].weightText",
        })
    })

    it("空行集给空映射", () => {
        expect(skuServerFieldMap("price", [])).toEqual({})
    })
})
