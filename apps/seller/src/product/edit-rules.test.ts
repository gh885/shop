import type { ProductStatus } from "@shop/api/sdk"
import { money } from "@shop/common/domain"
import { describe, expect, it } from "vite-plus/test"

import { publishGateError, willPublish, type SaveMode } from "./edit-rules"
import type { SkuDraftRow } from "./draft-model"

/** 夹具：SkuDraftRow 可控构造（只关心 price 是否 null；价格按分书写，夹具内换 Money） */
function makeRow(price: number | null): SkuDraftRow {
    return {
        skuId: "s1",
        label: "单规格",
        price: price === null ? null : money(price),
        stock: 0,
        skuCode: null,
        status: "ON_SALE",
    }
}

const UNPRICED = [makeRow(null)]
const ALL_PRICED = [makeRow(100), makeRow(200)]
const SOME_UNPRICED = [makeRow(100), makeRow(null)]

// willPublish：动作是否会把商品移出草稿
describe("willPublish", () => {
    it.each<[SaveMode, ProductStatus | undefined, boolean]>([
        // 草稿态会发布——只有「打草稿 → 出草稿」的迁移动作才算
        ["submit", "DRAFT", true],
        ["warehouse", "DRAFT", true],
        // 新建会话（无真实状态）行为等同草稿
        ["submit", undefined, true],
        // 保存草稿从不发布；即便来源是 DRAFT 也只是续存
        ["draft", "DRAFT", false],
        // 仓库/上架会话：保存变更不回退状态、不发布
        ["submit", "WAREHOUSE", false],
        ["submit", "PUBLISHED", false],
    ])("mode=%s status=%s → %s", (mode, status, expected) => {
        expect(willPublish(mode, status)).toBe(expected)
    })
})

// publishGateError：保存/发布前门槛（草稿无门槛；将发布要求全设价；保存变更要求价格必填）
describe("publishGateError", () => {
    it("有未设价 SKU 且本次将发布（新建/草稿会话点提交/入库）→ 拒绝并提示补全", () => {
        expect(publishGateError(UNPRICED, "submit", "DRAFT")).toBe(
            "seller.product.gate.error.publishUnpriced",
        )
        expect(publishGateError(UNPRICED, "warehouse", undefined)).toBe(
            "seller.product.gate.error.publishUnpriced",
        )
    })

    it("有未设价 SKU 但处于仓库/上架会话（priceRequired）→ 拒绝并提示价格必填", () => {
        // 仓库/上架会话动作不会发布（willPublish=false），但价格必填语义仍拦截
        expect(publishGateError(UNPRICED, "submit", "WAREHOUSE")).toBe(
            "seller.product.gate.error.priceRequired",
        )
        expect(publishGateError(UNPRICED, "submit", "PUBLISHED")).toBe(
            "seller.product.gate.error.priceRequired",
        )
    })

    it("保存草稿（draft）：未设价不触发门槛（草稿允许留空，不写 0 落库）", () => {
        expect(publishGateError(UNPRICED, "draft", "DRAFT")).toBeUndefined()
    })

    it("全设价：任何动作都通过", () => {
        expect(publishGateError(ALL_PRICED, "submit", "DRAFT")).toBeUndefined()
        expect(publishGateError(ALL_PRICED, "submit", "WAREHOUSE")).toBeUndefined()
        expect(publishGateError(ALL_PRICED, "draft", "DRAFT")).toBeUndefined()
    })

    it("部分设价是「有未设价 SKU」，与全空一样会被拦（以集合判定而非全部）", () => {
        expect(publishGateError(SOME_UNPRICED, "submit", "DRAFT")).toBe(
            "seller.product.gate.error.publishUnpriced",
        )
    })

    it("0 元是合法价：price=0 不算未设价（null 才表态未设置）", () => {
        const zeroPriced = [makeRow(0)]
        expect(publishGateError(zeroPriced, "submit", "DRAFT")).toBeUndefined()
    })
})
