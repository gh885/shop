import type { ProductStatus } from "@shop/api/sdk"

import type { SellerMessageKey } from "#/locales/messages.gen"

import { unpricedRows, type SkuDraftRow } from "./draft-model"

export type SaveMode = "submit" | "warehouse" | "draft"

type GateNoticeKey = Extract<SellerMessageKey, `product.gate.notice.${string}`>

export type GateErrorKey = Extract<
    SellerMessageKey,
    "product.gate.error.publishUnpriced" | "product.gate.error.priceRequired"
>

// 「商品状态 × 编辑会话能力」规则表 —— 后端 SPU 状态机的声明式镜像：真值在后端（迁移合法性 / ensurePublishable 由 409 兜底），这里只驱动 UX 与前端预检，不裁决、不发明规则
export interface EditCapability {
    // 类目是结构性字段：仅 DRAFT（含新建会话）可改，发布后需重新发布
    switchCategory: boolean
    // 规格组合：PUBLISHED 冻结（要改先下架）；价格/库存是运营字段始终可改
    specsEditable: boolean
    // 本会话是否有发布动作；发布目标由 SaveMode 决定，不在表里（此前误存没人读的目标状态列表）
    canPublish: boolean
    // 离开草稿态后价格必填：禁止把商品存成「有组合但未设价」
    priceRequired: boolean
    noticeKey?: GateNoticeKey
}

const PRODUCT_EDIT_RULES: Record<ProductStatus, EditCapability> = {
    DRAFT: {
        switchCategory: true,
        specsEditable: true,
        canPublish: true,
        priceRequired: false,
    },
    WAREHOUSE: {
        switchCategory: false,
        specsEditable: true,
        canPublish: false,
        priceRequired: true,
        noticeKey: "product.gate.notice.warehouse",
    },
    PUBLISHED: {
        switchCategory: false,
        specsEditable: false,
        canPublish: false,
        priceRequired: true,
        noticeKey: "product.gate.notice.published",
    },
}

export function editRules(status: ProductStatus | undefined): EditCapability {
    return status === undefined ? PRODUCT_EDIT_RULES.DRAFT : PRODUCT_EDIT_RULES[status]
}

export function willPublish(mode: SaveMode, status: ProductStatus | undefined): boolean {
    return mode !== "draft" && editRules(status).canPublish
}

// 门槛绑定「动作目标」而非「商品状态」（保存≠发布）：将发布→全 SKU 设价是迁移守卫的前端预检（后端 ensurePublishable 仍兜底 409）；保存变更→priceRequired
export function publishGateError(
    rows: SkuDraftRow[],
    mode: SaveMode,
    status: ProductStatus | undefined,
): GateErrorKey | undefined {
    if (unpricedRows(rows).length === 0) return undefined
    if (willPublish(mode, status)) return "product.gate.error.publishUnpriced"
    if (editRules(status).priceRequired) {
        return "product.gate.error.priceRequired"
    }
    return undefined
}
