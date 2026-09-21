import type { AfterSaleStatus, TicketStatus } from "@shop/api/sdk"

import type { OrderStatus } from "#/shared/order-status"

/**
 * 售后领域层 —— 纯规则 + 类型。售后单数据形状直接用 SDK `TicketResponse`
 * （契约已标 required/nullable，逐字段如实透传，没有需要归一的字段，不造镜像类型）。
 *
 * 状态机唯一真相在后端（`aftersale/model/TicketAction` 那张转移表）；前端**不复刻**转移表，
 * 只回答两个它能独立回答的问题（都不依赖后端未来怎么变）：
 *   1. 这个订单现在还能不能发起申请（订单状态 + 申请窗口 + 是否已有进行中的单，三项都在订单契约里）；
 *   2. 这张售后单此刻对买家露出哪些操作（由售后单自身状态直接读出）。
 *
 * 展示文案 / 徽章语义在 ./constants.ts；转账与退款的合法性一律不在前端判定——
 * 点了发请求，被后端 409 拒了就是拒了。
 */

// 买家可执行操作（由售后单状态读出）
export type AfterSaleAction = "cancel" | "return" | "track"

/**
 * 买家此刻对这张售后单能做的事：
 * - 待卖家处理 → 还能撤销（一旦卖家同意，货/钱已在途，撤销口子就关了）
 * - 待寄回商品 → 填/改退货物流单；已填过则再给一个「查看退货物流」
 * - 终态 → 无操作（退款成功/被拒/已撤销都只是历史）
 */
export function buyerAfterSaleActions(ticket: {
    status: TicketStatus
    returnTrackingNo: string | null
}): AfterSaleAction[] {
    if (ticket.status === "APPLYING") return ["cancel"]
    if (ticket.status === "RETURNING") {
        return ticket.returnTrackingNo ? ["return", "track"] : ["return"]
    }
    return []
}

// 能否发起申请
export interface ApplyGate {
    /** 前端领域订单状态 */
    status: OrderStatus
    /** 订单上的售后投影：最近一张售后单的状态（NONE = 从未申请过） */
    afterSaleStatus: AfterSaleStatus
    /** 申请截止时刻（契约可空：未完成 / 已过窗口由后端算好） */
    applyExpireAt: string | null
}

/** 进行中 = 这张单还挂着，同一订单不能并存第二张 */
const OPEN_STATUS: ReadonlySet<AfterSaleStatus> = new Set(["APPLYING", "RETURNING"])

/**
 * 能否发起售后申请。三项同时成立：
 * 1. 订单已完成（确认收货或自动收货后窗口才开）；
 * 2. 申请窗口没过（applyExpireAt 由后端算出，前端只比时刻——窗口天数归后端，前端不复制规则）；
 * 3. 没有进行中的售后单。
 *
 * 已退款不再提供入口：后端 V1 未拦「退款后二次申请」，前端不主动把用户送到重复退款那条路上
 * （已知敞口见 docs/business-rules/aftersale.md AFS-05）。已拒绝/已撤销则允许重新申请——窗口内这是买家的正当权利。
 */
export function canApplyAfterSale(gate: ApplyGate, now: number = Date.now()): boolean {
    if (gate.status !== "completed") return false
    if (OPEN_STATUS.has(gate.afterSaleStatus)) return false
    if (gate.afterSaleStatus === "REFUNDED") return false
    if (!gate.applyExpireAt) return false
    const expire = Date.parse(gate.applyExpireAt)
    return Number.isFinite(expire) && expire > now
}
