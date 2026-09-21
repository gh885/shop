import type { AfterSaleStatus, TicketAvailableAction } from "@shop/api/sdk"

import type { OrderStatus } from "#/shared/order-status"

/**
 * 售后领域层 —— 纯规则 + 类型。售后单数据形状直接用 SDK `TicketResponse`
 * （契约已标 required/nullable，逐字段如实透传，没有需要归一的字段，不造镜像类型）。
 *
 * 状态机唯一真相在后端（`aftersale/model/TicketAction` 转移表），「这张单此刻露出哪些操作」也一并由
 * 后端算好随契约下发（C5b：`availableActions`，视角随端点而定）——前端**不再按状态复刻按钮表**，
 * 只做「契约动作 → UI 动作」的投影，外加一条纯导航（查看退货物流）。
 *
 * 还剩一个前端独立回答的问题：这个订单能不能发起申请（canApplyAfterSale）——它吃的三项
 * （订单状态 / 售后投影 / 申请截止时刻）全在订单契约里，是入口门槛，不是状态机复刻。
 *
 * 展示文案 / 徽章语义在 ./constants.ts；转账与退款的合法性一律不在前端判定——
 * 点了发请求，被后端 409 拒了就是拒了。
 */

// 买家可执行操作（由契约动作投影；track 是纯导航入口，不在契约里）
export type AfterSaleAction = "cancel" | "return" | "track" | "reapply"

/** 契约动作 → UI 动作。卖家那三个（AGREE/REJECT/RECEIVE_RETURN）不会下发到买家端点，这里刻意缺席 */
const BUYER_ACTION_UI: Partial<Record<TicketAvailableAction, AfterSaleAction>> = {
    CANCEL: "cancel",
    RETURN_GOODS: "return",
    REAPPLY: "reapply",
}

/** 售后卡关心的两个契约字段（都是契约必填，如实按契约读；动作枚举用 SDK 生成的 TicketAvailableAction） */
export interface AfterSaleTicketView {
    availableActions: TicketAvailableAction[]
    returnTrackingNo: string | null
}

/**
 * 买家此刻对这张售后单能做的事——读后端下发，不按状态自推：
 * - 待卖家处理 → 撤销（CANCEL；卖家同意后货/钱在途，口子就关了）
 * - 待寄回商品 → 填/改退货物流（RETURN_GOODS；可重复提交，后端覆盖旧运单，C10）
 * - 被拒/已撤销且申请窗口内 → 重新申请（REAPPLY；已退款终态后端不下发，AFS-05）
 * 已填过运单号再追加一条「查看退货物流」：导航入口不是状态机动作，后端不下发，前端自己加。
 */
export function buyerAfterSaleActions(ticket: AfterSaleTicketView): AfterSaleAction[] {
    const actions = ticket.availableActions.flatMap((action) => {
        const ui = BUYER_ACTION_UI[action]
        return ui ? [ui] : []
    })
    if (actions.includes("return") && ticket.returnTrackingNo) actions.push("track")
    return actions
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
 * 能否发起售后申请（订单详情上的「申请售后」入口；有历史售后单时同一资格也由票据的 REAPPLY 下发）。
 * 三项同时成立：
 * 1. 订单已完成（确认收货或自动收货后窗口才开）；
 * 2. 申请窗口没过（applyExpireAt 由后端算出，前端只比时刻——窗口天数归后端，前端不复制规则）；
 * 3. 没有进行中的售后单。
 *
 * 已退款不给入口：后端已用 AFTER_SALE_ALREADY_REFUNDED 挡住二次申请（AFS-05），前端同样不引导。
 * 已拒绝/已撤销则允许重新申请——窗口内这是买家的正当权利。
 */
export function canApplyAfterSale(gate: ApplyGate, now: number = Date.now()): boolean {
    if (gate.status !== "completed") return false
    if (OPEN_STATUS.has(gate.afterSaleStatus)) return false
    if (gate.afterSaleStatus === "REFUNDED") return false
    if (!gate.applyExpireAt) return false
    const expire = Date.parse(gate.applyExpireAt)
    return Number.isFinite(expire) && expire > now
}
