import type { TicketResponse } from "@shop/api/sdk"

/**
 * 售后决策的纯规则 —— 「点了会怎样」那句话由售后单本身拼出来。
 *
 * 这几句话决定卖家按下「同意」时答应的是什么（仅退款 = 点完就退钱，退货退款 = 先等货回来），
 * 只吃「动作种类 + 售后单」两个入参，不需要 React，所以住在 .ts 里被单测钉住；
 * 弹窗（after-sale-decision-dialog.tsx）只负责画它交出来的文本。
 */

/** 卖家在决策弹窗里能做的三种决定（也是工作台行内按钮的动作种类） */
export type SaleDecisionKind = "agree" | "reject" | "receive"

/** 弹窗标题：三种决定各一句，正文不再重复动作名 */
export const DECISION_TITLE: Record<SaleDecisionKind, string> = {
    agree: "同意售后",
    reject: "拒绝售后",
    receive: "确认收到退货",
}

/** 售后单：读取中是 undefined、404 是 null —— 两种「没有」在下面给同一句保守话术 */
export type DecisionTicket = TicketResponse | null | undefined

/**
 * 一句话说明「点了会怎样」。
 * 同意与拒绝的走向都随售后类型 / 当前态分岔，所以**没拿到售后单就不断言走向**——宁可少说一句，
 * 也不能在「退货退款」的单上写着「商品不寄回」，那正是卖家最容易被误导的一行。
 */
export function describeDecision(kind: SaleDecisionKind, ticket: DecisionTicket): string {
    if (kind === "reject") {
        if (!ticket) return "请填写拒绝理由后再提交。"
        return ticket.status === "RETURNING"
            ? "拒绝后这笔退款不会打出、库存也不回补；买家仍可在申请窗口内重新提交申请。"
            : "拒绝后买家仍可在申请窗口内重新提交申请。"
    }
    if (kind === "receive") return "确认后立即退款给买家并回补库存，请先核对退回的包裹。"
    if (!ticket) return "请先核对售后内容再确认。"
    return ticket.type === "RETURN_REFUND"
        ? "同意后进入退货流程：买家寄回、你确认收货后才退款并回补库存。"
        : "同意后立即退款给买家，商品不寄回。"
}

/**
 * 退货运单那一行。没登记运单号时说「买家尚未登记」而不是留一格空白——
 * 卖家核对收货时，空白会被读成「界面没显示出来」，那一句话才会让人去查快递而不是去催买家。
 * 承运商可空（回寄是手输原文，对不上字典也照实记），缺给「快递」兜住排版，不交出一个孤零零的单号。
 */
export function returnShipmentText(ticket: TicketResponse): string {
    if (!ticket.returnTrackingNo) return "买家尚未登记运单号"
    return `${ticket.returnLogisticsCompany ?? "快递"} ${ticket.returnTrackingNo}`
}
