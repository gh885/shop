import type { AfterSaleReason, TicketStatus, TicketType } from "@shop/api/sdk"

import type { OrderTab } from "./orders-search"
import type { OrderAction, OrderActionSurface, OrderStatus } from "./model"

/**
 * order 域 · 常量层：展示文案 / 色板 / 动作表 / 页签。
 *
 * 为什么单独一个文件：这些表会被多个组件同时消费（订单卡片、状态区、进度条、售后卡、申请弹窗），
 * 散在各自组件里必然漂移——同一个状态在卡上是「交易成功」、在页签上是「已完成」，
 * 用户会以为是两件事。文案与状态一一对应，所以它跟状态机一样只能有一份。
 *
 * 只放纯数据/查表：不 import 组件、不含规则（规则在 model.ts / after-sale.ts）。
 *
 * **这里没有文案了**（2026-10-19）。原来「码值 → 中文句子」那几张表（状态名、动作名、售后原因…）
 * 搬进了 `./order-label`，句子由 catalog 出（i18n §4.2）。留下的全是**换语言不会变**的那一半：
 * 色板、顺序、下标、可见性判断。判据就这一条：换语言会不会变。
 */

// 履约主状态
/**
 * 状态 → 卡片状态区的**色板**（句子在 `./order-label` 的 `orderStatusLabel` / `orderCardHint`）。
 * 订单卡片只描述履约状态，不推断支付退款、售后资格或承运商进度。
 */
export const ORDER_CARD_STATUS_TONE: Record<
    OrderStatus,
    "warning" | "info" | "success" | "secondary"
> = {
    pending_payment: "warning",
    pending_shipment: "info",
    pending_receipt: "info",
    completed: "success",
    cancelled: "secondary",
}

/**
 * 订单列表页签：全部 + 有筛选价值的四个状态。
 * 「已取消」不进页签（买家找它的方式是往下翻，而不是把它当一类待办）。
 * 标签是句子，由调用方经 `./order-label` 现取——本表只留**页签有哪几个**。
 */
export const ORDER_STATUS_TABS: readonly OrderTab[] = [
    "all",
    "pending_payment",
    "pending_shipment",
    "pending_receipt",
    "completed",
]

// 进度条
/** 进度条固定四步（与截图一致）。**步骤名是句子**，在 `./order-label` 的 `orderProgressStep(index)` */
export const ORDER_PROGRESS_STEP_COUNT = 4 as const

/** 状态 → 进度条当前停留的步骤下标（0 起步；取消不按进度展示，给 -1） */
export const ORDER_PROGRESS_STEP: Record<OrderStatus, number> = {
    pending_payment: 0, // 已拍下，待付款
    pending_shipment: 1, // 已付款，待发货
    pending_receipt: 2, // 已发货，待收货
    completed: 3, // 全流程完成
    cancelled: -1, // 取消：不按进度展示
}

// 订单可执行动作
// 「能做什么」由后端状态机说了算（order.availableActions）；这里只定三件设计决策：
// 文案、展示顺序、哪个是主操作。

/**
 * 按钮排展示顺序。
 *
 * 后端给的是集合（同一状态的动作无先后语义），画出来必须稳定——否则同一份数据两次渲染位置不同。
 * 顺序是设计决策（左→右：交易主流程 → 辅助入口），所以留在前端；
 * 新增动作忘了加进这里会被 order.test.ts 的完整性测试拦住。
 */
export const ORDER_ACTION_ORDER: readonly OrderAction[] = [
    "pay",
    "cancel",
    "logistics",
    "confirm",
    // 延长收货紧跟在「确认收货」后面：两者是同一件事的正反面（现在就收 / 再等等），
    // 隔开排会让买家在两处都看到按钮却不知道是一组
    "extend_receive",
    "rebuy",
    "add_cart",
    "ship",
]

/**
 * 前端附加动作：后端状态机不会产生的那些（导航/加购），按页面 + 状态追加。
 *
 * 与后端动作分开写是故意的：「已完成多给一个再买一单」是我们自己的产品决定，
 * 不该掺进后端动作集；反过来后端给的新动作也不需要改这里。
 */
const CARD_UI_ACTIONS: Partial<Record<OrderStatus, readonly OrderAction[]>> = {
    pending_receipt: ["logistics"],
    completed: ["rebuy"],
    cancelled: ["rebuy"],
}

export const ORDER_UI_ACTIONS: Record<
    OrderActionSurface,
    Partial<Record<OrderStatus, readonly OrderAction[]>>
> = {
    card: CARD_UI_ACTIONS,
    // 详情页与卡片同源，仅 completed 额外给「加入购物车」（可加购的入口不该只在列表页）
    detail: { ...CARD_UI_ACTIONS, completed: ["rebuy", "add_cart"] },
}

/** 每屏唯一的主操作（橙色）：没有指定就全是描边。列表卡片不把「再买一单」当主操作（浏览语境） */
export const ORDER_PRIMARY_ACTION: Record<
    OrderActionSurface,
    Partial<Record<OrderStatus, OrderAction>>
> = {
    card: { pending_payment: "pay", pending_receipt: "confirm" },
    detail: { pending_payment: "pay", pending_receipt: "confirm", completed: "rebuy" },
}

/**
 * 订单内商品行上的操作。`after_sale` 要过 canApplyAfterSale 这道门槛才渲染。
 */
export const ORDER_ITEM_ACTIONS: readonly string[] = ["add_cart", "after_sale"]

/** 类型单选的展示顺序：仅退款在前（更轻的那条路先给） */
export const AFTER_SALE_TYPE_ORDER: TicketType[] = ["REFUND_ONLY", "RETURN_REFUND"]

/** 原因下拉的展示顺序：无理由在最前（不需要举证的那条路先给），「其他」垫底 */
export const AFTER_SALE_REASON_ORDER: AfterSaleReason[] = [
    "NO_REASON",
    "QUALITY_ISSUE",
    "NOT_AS_DESCRIBED",
    "DAMAGED",
    "WRONG_ITEM",
    "MISSING_ITEM",
    "OTHER",
]

/**
 * 售后单状态 → 徽章**色板**（APPLYING/RETURNING 是进行中，其余为终态；句子在
 * `./order-label` 的 `ticketStatusLabel`）。
 * 文案与色板分成两张平行表，加状态时少得改两处——漏一处就是徽章没色或文案缺失。
 */
export const TICKET_STATUS_TONE: Record<TicketStatus, "default" | "secondary" | "destructive"> = {
    APPLYING: "default",
    RETURNING: "default",
    REFUNDED: "secondary",
    REJECTED: "destructive",
    CLOSED: "secondary",
}
