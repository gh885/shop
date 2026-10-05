import type { ProductStatus } from "@shop/api/sdk"

import type { SellerMessageKey } from "#/locales/messages.gen"

import { unpricedRows, type SkuDraftRow } from "./draft-model"

/** 保存/发布的动作模式（本模块独立真相源） */
export type SaveMode = "submit" | "warehouse" | "draft"

/** 编辑页状态提示条文案的 catalog key 子集：只有 `seller.product.gate.notice.*` 可选，写错键即编译错 */
type GateNoticeKey = Extract<SellerMessageKey, `seller.product.gate.notice.${string}`>

/** 门槛预检拒绝文案的 catalog key：拦下来时交给用户的整句（无 ICU 槽位，渲染边界 `t` 它不收第二参） */
export type GateErrorKey = Extract<
    SellerMessageKey,
    "seller.product.gate.error.publishUnpriced" | "seller.product.gate.error.priceRequired"
>

/**
 * 「商品状态 × 编辑会话能力」规则表 —— 后端 SPU 状态机的**声明式镜像**：真值在后端（状态迁移合法性 / ensurePublishable
 * 门槛由 409 兜底），这里只驱动 UX（禁用/显隐/文案）与前端预检，不裁决、不发明规则。
 *
 * 对齐千牛的编辑心智：
 *  - 基本字段（标题/图/详情/价格/库存）任何状态可编辑——在售也实时生效，不要求下架；
 *  - 类目是结构性字段（发布时确定）→ 仅 DRAFT（含新建会话）可改，发布后不可改；
 *  - 规格组合：PUBLISHED 冻结（要改先下架）；
 *  - 「发布/上架」是迁移动作（带门槛）；「保存」不是——已出草稿商品用 priceRequired
 *    （表单必填语义）保证永远不会被存成「有组合但未设价」，而非在保存动作上做全局门槛。
 */
export interface EditCapability {
    /** 能否切换类目（结构性字段：仅草稿可改，发布后需重新发布） */
    switchCategory: boolean
    /** 能否改规格组合（上架冻结；价格/库存是运营字段始终可改） */
    specsEditable: boolean
    /** 本会话可选的发布目标（迁移动作）；undefined = 无发布动作，只剩「保存变更」 */
    publishTargets: readonly ("PUBLISHED" | "WAREHOUSE")[] | undefined
    /** 价格必填（离开草稿态后）：对齐表单必填——禁止把商品存成「有组合但未设价」 */
    priceRequired: boolean
    /** 编辑页状态提示条文案的 catalog key（可选）；渲染点按当前语言换出句子 */
    noticeKey?: GateNoticeKey
}

const PRODUCT_EDIT_RULES: Record<ProductStatus, EditCapability> = {
    DRAFT: {
        switchCategory: true,
        specsEditable: true,
        publishTargets: ["PUBLISHED", "WAREHOUSE"],
        priceRequired: false,
    },
    WAREHOUSE: {
        switchCategory: false,
        specsEditable: true,
        publishTargets: undefined,
        priceRequired: true,
        noticeKey: "seller.product.gate.notice.warehouse",
    },
    PUBLISHED: {
        switchCategory: false,
        specsEditable: false,
        publishTargets: undefined,
        priceRequired: true,
        noticeKey: "seller.product.gate.notice.published",
    },
}

/** 新建会话（尚无真实商品态）：能力等同草稿 */
export function editRules(status: ProductStatus | undefined): EditCapability {
    return status === undefined ? PRODUCT_EDIT_RULES.DRAFT : PRODUCT_EDIT_RULES[status]
}

/** 本次动作是否会把商品移出草稿（提交/入库→是；保存草稿、仓库/上架会话保存变更→否）。 */
export function willPublish(mode: SaveMode, status: ProductStatus | undefined): boolean {
    return mode !== "draft" && editRules(status).publishTargets !== undefined
}

/**
 * 保存/发布前的门槛预检：返回 undefined=通过，否则返回「给用户的拒绝文案」的 catalog key
 * （句子由渲染边界按当前语言换出，见 ProductEditor 的 BusinessError 分支）。
 *
 * 门槛绑定「动作目标」而非「商品状态」（对齐千牛：保存≠发布）：
 * - 将发布（新建/草稿会话点提交/入库）：全 SKU 设价是迁移守卫的前端预检（后端 ensurePublishable 仍兜底 409）；
 * - 保存变更（仓库/上架会话）：priceRequired —— 已出草稿商品不允许留未设价 SKU（草稿允许留空，不写 0 落库）。
 */
export function publishGateError(
    rows: SkuDraftRow[],
    mode: SaveMode,
    status: ProductStatus | undefined,
): GateErrorKey | undefined {
    if (unpricedRows(rows).length === 0) return undefined
    if (willPublish(mode, status)) return "seller.product.gate.error.publishUnpriced"
    if (editRules(status).priceRequired) {
        return "seller.product.gate.error.priceRequired"
    }
    return undefined
}
