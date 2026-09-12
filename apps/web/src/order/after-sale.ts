import type { AfterSaleStatus, TicketResponse, TicketStatus, TicketType } from "@shop/api/sdk"
import type { Money } from "@shop/common"

import type { OrderStatus } from "#/shared/order-status"

/**
 * 售后领域层 —— 售后单业务类型 + 纯规则，不知道 wire 的一切。
 *
 * 状态机唯一真相在后端（`aftersale/model/TicketAction` 那张转移表）；前端**不复刻**转移表，
 * 只回答两个它能独立回答的问题（都不依赖后端未来怎么变）：
 *   1. 这个订单现在还能不能发起申请（订单状态 + 申请窗口 + 是否已有进行中的单，三项都在订单契约里）；
 *   2. 这张售后单此刻对买家露出哪些操作（由售后单自身状态直接读出）。
 *
 * 转账/退款的合法性一律不在前端判定——点了发请求，被后端 409 拒了就是拒了（见 queries 的统一提示）。
 */

// ---------- 展示辅助 ----------

/** 售后类型 → 展示名（申请时买家二选一：货留不留） */
export const AFTER_SALE_TYPE_LABEL: Record<TicketType, string> = {
    REFUND_ONLY: "仅退款",
    RETURN_REFUND: "退货退款",
}

/** 售后单状态 → 买家视角文案（APPLYING/RETURNING 是进行中，其余为终态） */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
    APPLYING: "待卖家处理",
    RETURNING: "待寄回商品",
    REFUNDED: "退款成功",
    REJECTED: "卖家已拒绝",
    CLOSED: "已撤销申请",
}

/** 售后单状态 → 徽章语义（进行中用 default，成功用 success 系，拒绝用 destructive，撤销用 secondary） */
export const TICKET_STATUS_TONE: Record<TicketStatus, "default" | "secondary" | "destructive"> = {
    APPLYING: "default",
    RETURNING: "default",
    REFUNDED: "secondary",
    REJECTED: "destructive",
    CLOSED: "secondary",
}

/** 申请入口的引导语：按类型说清「货怎么走」，避免买家把仅退款理解成退货退款 */
export const AFTER_SALE_TYPE_HINT: Record<TicketType, string> = {
    REFUND_ONLY: "不寄回商品，卖家同意后直接退款",
    RETURN_REFUND: "需要寄回商品，卖家确认收货后退款",
}

/** 类型单选的展示顺序：仅退款在前（更轻的那条路先给） */
export const AFTER_SALE_TYPE_ORDER: TicketType[] = ["REFUND_ONLY", "RETURN_REFUND"]

// ---------- 领域类型 ----------

/** 售后单业务形状（wire 的可空字段如实透传 null，展示层处理「无」） */
export type AfterSaleTicket = {
    id: string
    orderId: string
    type: TicketType
    status: TicketStatus
    /** 买家填写的理由（可空，未填即 null） */
    reason: string | null
    /** 退款口径（V1 = 整单实付）；契约上可空，未退款前也可能是 null */
    refundAmount: Money | null
    /** 退货物流公司（回寄后才有） */
    returnLogisticsCompany: string | null
    returnTrackingNo: string | null
    /** 退款完成时刻 */
    refundedAt: string | null
    createdAt: string
    updatedAt: string
}

/** 售后单 wire → 业务：契约已标 required/nullable，逐字段直投，不做 ?? 造假 */
export function toAfterSaleTicket(dto: TicketResponse): AfterSaleTicket {
    return {
        id: dto.id,
        orderId: dto.orderId,
        type: dto.type,
        status: dto.status,
        reason: dto.reason,
        refundAmount: dto.refundAmount,
        returnLogisticsCompany: dto.returnLogisticsCompany,
        returnTrackingNo: dto.returnTrackingNo,
        refundedAt: dto.refundedAt,
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
    }
}

// ---------- 买家可执行操作（由售后单状态读出） ----------

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

// ---------- 能否发起申请 ----------

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
 * （见 docs/decisions/aftersale.md「已知边界」）。已拒绝/已撤销则允许重新申请——窗口内这是买家的正当权利。
 */
export function canApplyAfterSale(gate: ApplyGate, now: number = Date.now()): boolean {
    if (gate.status !== "completed") return false
    if (OPEN_STATUS.has(gate.afterSaleStatus)) return false
    if (gate.afterSaleStatus === "REFUNDED") return false
    if (!gate.applyExpireAt) return false
    const expire = Date.parse(gate.applyExpireAt)
    return Number.isFinite(expire) && expire > now
}
