import { describe, expect, it } from "vite-plus/test"

import type { CarrierResponse } from "@shop/api/sdk"

import { VALIDATION_RULES } from "@shop/common/contract"
import { TRACKING_NO_MAX } from "@shop/common/domain"
import { carrierSelectItems, ShipSchema, shipInputFromForm } from "./ship-form"

/**
 * 发货表单规则测试：钉的是「交回后端的是字典 code」这一件事。
 *
 * 承运商从自由文本升级成字典下拉，退回去不会报错——只是又落进五种写法的「顺丰」，
 * 统计与物流商对接同时作废，所以这条必须有一行测试挡着。
 */

const CARRIERS: CarrierResponse[] = [
    { code: "SF", name: "顺丰速运" },
    { code: "ZTO", name: "中通快递" },
]

/** 校验失败时用户会看到的句子（成功时是空数组） */
function issues(values: unknown): string[] {
    return ShipSchema.safeParse(values).error?.issues.map((issue) => issue.message) ?? []
}

describe("ShipSchema", () => {
    it("没选承运商：给的是 catalog 那条「必填」事实，不是 zod 默认的英文句", () => {
        expect(issues({ carrierCode: "", trackingNo: "SF123456" })).toContain(
            VALIDATION_RULES.REQUIRED,
        )
    })

    it("运单号空着 / 只有空格都不放行（空格在 trim 之后就是空）", () => {
        expect(issues({ carrierCode: "SF", trackingNo: "" }).length).toBeGreaterThan(0)
        expect(ShipSchema.safeParse({ carrierCode: "SF", trackingNo: "   " }).success).toBe(false)
    })

    it("运单号超出上限被拒，上限就是 @shop/common 那一个数", () => {
        expect(
            ShipSchema.safeParse({ carrierCode: "SF", trackingNo: "1".repeat(TRACKING_NO_MAX) })
                .success,
        ).toBe(true)
        expect(
            ShipSchema.safeParse({
                carrierCode: "SF",
                trackingNo: "1".repeat(TRACKING_NO_MAX + 1),
            }).success,
        ).toBe(false)
    })

    it("校验通过就顺手清掉首尾空格：交出来的 data 已经是能拿去精确匹配的形状", () => {
        const parsed = ShipSchema.safeParse({ carrierCode: "SF", trackingNo: " SF123456 " })

        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.trackingNo).toBe("SF123456")
    })
})

describe("shipInputFromForm", () => {
    it("提交体只有 code 与运单号两格，运单号不带空格", () => {
        expect(shipInputFromForm({ carrierCode: "SF", trackingNo: "SF123456 " })).toEqual({
            carrierCode: "SF",
            trackingNo: "SF123456",
        })
    })
})

describe("carrierSelectItems", () => {
    it("下拉的 value 是字典 code、label 才是展示名：填反了就把展示名写进了库", () => {
        expect(carrierSelectItems(CARRIERS)).toEqual([
            { value: "SF", label: "顺丰速运" },
            { value: "ZTO", label: "中通快递" },
        ])
    })

    it("字典为空时交出空数组，不造一项占位", () => {
        expect(carrierSelectItems([])).toEqual([])
    })
})
