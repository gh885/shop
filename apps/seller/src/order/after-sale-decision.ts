import type { TicketResponse } from "@shop/api/sdk"

import type { SellerMessageKey } from "#/locales/messages.gen"

/**
 * 售后决策的纯规则 —— 「点了会怎样」由**决策本身选一句 catalog 文案（返回其 key）**，
 * 句子在渲染边界由弹窗的本端 `t` 换出来（§6：schema/纯层发事实、渲染层成句）。
 *
 * 这几句决定卖家按下「同意」时答应的是什么（仅退款 = 点完就退钱，退货退款 = 先等货回来），
 * 走向随售后单分岔，所以「选哪一句」是纯逻辑、不需要 React，住在 .ts 里被单测钉住；
 * 弹窗（after-sale-decision-dialog.tsx）只负责 `t` 它交出来的 key。
 */

/** 卖家在决策弹窗里能做的三种决定（也是工作台行内按钮的动作种类） */
export type SaleDecisionKind = "agree" | "reject" | "receive"

/** 决策文案的 key 收窄：都是无 ICU 槽位的整句（走向分岔在代码里、不在句子里），故 `t` 不收第二参 */
type DecisionTitleKey = Extract<SellerMessageKey, `order.decision.title.${string}`>
type DecisionDescKey = Extract<SellerMessageKey, `order.decision.desc.${string}`>

/** 弹窗标题：三种决定各一句，正文不再重复动作名 */
export const DECISION_TITLE: Record<SaleDecisionKind, DecisionTitleKey> = {
    agree: "order.decision.title.agree",
    reject: "order.decision.title.reject",
    receive: "order.decision.title.receive",
}

/** 售后单：读取中是 undefined、404 是 null —— 两种「没有」在下面给同一句保守话术 */
export type DecisionTicket = TicketResponse | null | undefined

/**
 * 一句「点了会怎样」的 catalog key。
 * 同意与拒绝的走向都随售后类型 / 当前态分岔，所以**没拿到售后单就不断言走向**——宁可少说一句，
 * 也不能在「退货退款」的单上写着「商品不寄回」，那正是卖家最容易被误导的一行。
 */
export function describeDecision(kind: SaleDecisionKind, ticket: DecisionTicket): DecisionDescKey {
    if (kind === "reject") {
        if (!ticket) return "order.decision.desc.rejectNoTicket"
        return ticket.status === "RETURNING"
            ? "order.decision.desc.rejectReturning"
            : "order.decision.desc.rejectOther"
    }
    if (kind === "receive") return "order.decision.desc.receive"
    if (!ticket) return "order.decision.desc.agreeNoTicket"
    return ticket.type === "RETURN_REFUND"
        ? "order.decision.desc.agreeReturnRefund"
        : "order.decision.desc.agreeRefundOnly"
}

/** 退货运单那一行的承运商兜底名（字典可空：回寄是手输原文，缺给「快递」兜住排版） */
export const RETURN_CARRIER_FALLBACK_KEY = "order.decision.defaultCarrier" as const

/** 没登记运单号时那一格的文案 key（弹窗在 returnTrackingNo 为 null 时 `t` 它，而不是交出一格空白） */
export const NO_RETURN_TRACKING_KEY = "order.decision.noReturnTracking" as const

/**
 * 退货运单那一行：承运商 + 单号，两者都是**动态内容**（§8 不翻译），这里只按空格摆位。
 * 没登记单号时回「尚未登记」那句、承运商缺名时用兜底词——两处 UI 文案都由**调用点**（弹窗）
 * 传进来（`t(RETURN_CARRIER_FALLBACK_KEY)` / `t(NO_RETURN_TRACKING_KEY)`），本层不认识语言、
 * 也不留裸中文；缺省为空串只为兼容「不传即不兜底」的裸调用，生产路径恒由弹窗补齐。
 */
export function returnShipmentText(
    ticket: TicketResponse,
    carrierFallback = "",
    notRegisteredLabel = "",
): string {
    if (!ticket.returnTrackingNo) return notRegisteredLabel
    return `${ticket.returnLogisticsCompany ?? carrierFallback} ${ticket.returnTrackingNo}`
}
