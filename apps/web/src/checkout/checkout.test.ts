import type { PreviewResponse } from "@shop/api/sdk"
import { describe, expect, it } from "vitest"

import { toCheckoutPreview } from "./checkout"

/**
 * 测试夹具：PreviewResponse wire 形状的可控构造。
 * 结算预览唯一需要归一的维度是各处可空的 image（null → undefined），其余字段只求合法。
 */
const MONEY = { amount: 19900, currency: "CNY" }

function makeDto(
    opts: {
        lineImage?: string | null
        unavailableImage?: string | null
        address?: PreviewResponse["address"]
    } = {},
): PreviewResponse {
    return {
        groups: [
            {
                shopId: "shop-1",
                shopName: "测试店",
                lines: [
                    {
                        skuId: "sku-1",
                        productId: "p-1",
                        name: "测试商品",
                        image: opts.lineImage ?? null,
                        price: MONEY,
                        originalPrice: MONEY,
                        quantity: 1,
                        stock: 5,
                    },
                ],
                itemAmount: MONEY,
                shippingFee: { amount: 0, currency: "CNY" },
                // 券三件套：默认不用券（无候选、无减免、未选中）
                discountAmount: { amount: 0, currency: "CNY" },
                payAmount: MONEY,
                deliverable: true,
                coupons: [],
                appliedCouponId: null,
            },
        ],
        unavailable: [
            {
                skuId: "sku-9",
                name: "失效商品",
                image: opts.unavailableImage ?? null,
                quantity: 1,
                cause: "SOLD_OUT",
            },
        ],
        address: opts.address ?? {
            id: "addr-1",
            receiverName: "张三",
            receiverPhone: "13800000000",
            province: "广东省",
            city: "深圳市",
            district: "南山区",
            detail: "科技园 1 号",
        },
        totalPayAmount: MONEY,
    }
}

describe("toCheckoutPreview", () => {
    it("行明细与失效行的主图 null 归一为 undefined，UI 层无需再判 null", () => {
        const preview = toCheckoutPreview(makeDto())

        expect(preview.groups[0]?.lines[0]?.image).toBeUndefined()
        expect(preview.unavailable[0]?.image).toBeUndefined()
    })

    it("有图时如实透传，不吞真实 URL", () => {
        const preview = toCheckoutPreview(
            makeDto({ lineImage: "img/a.png", unavailableImage: "img/b.png" }),
        )

        expect(preview.groups[0]?.lines[0]?.image).toBe("img/a.png")
        expect(preview.unavailable[0]?.image).toBe("img/b.png")
    })

    it("分组结构与金额字段原样保留：不造假默认值", () => {
        const dto = makeDto()
        const preview = toCheckoutPreview(dto)

        expect(preview.groups).toMatchObject([
            { shopId: "shop-1", shopName: "测试店", itemAmount: MONEY, payAmount: MONEY },
        ])
        expect(preview.totalPayAmount).toEqual(dto.totalPayAmount)
    })

    it("地址回显原样透传：字段不重排不造默认值", () => {
        expect(toCheckoutPreview(makeDto()).address).toMatchObject({
            receiverName: "张三",
            receiverPhone: "13800000000",
            detail: "科技园 1 号",
        })
    })
})
