import type { TicketStatus, TicketType } from "@shop/api/sdk"

import type { OrderTab } from "./orders-search"
import type { OrderAction, OrderActionSurface, OrderStatus } from "./model"
import type { AfterSaleAction } from "./after-sale"

/**
 * order 域 · 常量层：展示文案 / 色板 / 动作表 / 页签。
 *
 * 为什么单独一个文件：这些表会被多个组件同时消费（订单卡片、状态区、进度条、售后卡、申请弹窗），
 * 散在各自组件里必然漂移——同一个状态在卡上是「交易成功」、在页签上是「已完成」，
 * 用户会以为是两件事。文案与状态一一对应，所以它跟状态机一样只能有一份。
 *
 * 只放纯数据/查表：不 import 组件、不含规则（规则在 model.ts / after-sale.ts）。
 */

// ---------- 履约主状态 ----------

/** 状态 → 中文展示名（卡片、状态区、详情信息卡、列表页签共用一份，不各写各的） */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
    pending_payment: "待付款",
    pending_shipment: "待发货",
    pending_receipt: "待收货",
    completed: "交易成功",
    cancelled: "已取消",
}

/** 订单卡片只描述履约状态，不推断支付退款、售后资格或承运商进度。 */
export const ORDER_CARD_STATUS_META = {
    pending_payment: { tone: "warning", hint: "请在付款截止前完成支付" },
    pending_shipment: { tone: "info", hint: "等待商家发货，发货后可查看物流" },
    pending_receipt: { tone: "info", hint: "可查看物流，收到商品后再确认收货" },
    completed: { tone: "success", hint: "订单已完成，售后信息可在详情中查看" },
    cancelled: { tone: "secondary", hint: "订单已关闭，取消及退款信息请查看详情" },
} as const satisfies Record<OrderStatus, { tone: string; hint: string }>

/**
 * 订单列表页签：全部 + 有筛选价值的四个状态。
 * 标签取 ORDER_STATUS_LABEL，不另写一份中文——页签与卡片说同一句话。
 * 「已取消」不进页签（买家找它的方式是往下翻，而不是把它当一类待办）。
 */
export const ORDER_STATUS_TABS: ReadonlyArray<{ key: OrderTab; label: string }> = [
    { key: "all", label: "全部" },
    { key: "pending_payment", label: ORDER_STATUS_LABEL.pending_payment },
    { key: "pending_shipment", label: ORDER_STATUS_LABEL.pending_shipment },
    { key: "pending_receipt", label: ORDER_STATUS_LABEL.pending_receipt },
    { key: "completed", label: ORDER_STATUS_LABEL.completed },
]

// ---------- 进度条 ----------

/** 进度条步骤名（固定四步，与截图一致） */
export const ORDER_PROGRESS_STEPS = ["拍下宝贝", "买家付款", "卖家发货", "确认收货"] as const

/** 状态 → 进度条当前停留的步骤下标（0 起步；取消不按进度展示，给 -1） */
export const ORDER_PROGRESS_STEP: Record<OrderStatus, number> = {
    pending_payment: 0, // 已拍下，待付款
    pending_shipment: 1, // 已付款，待发货
    pending_receipt: 2, // 已发货，待收货
    completed: 3, // 全流程完成
    cancelled: -1, // 取消：不按进度展示
}

// ---------- 订单可执行动作 ----------
// 「能做什么」由后端状态机说了算（order.availableActions）；这里只定三件设计决策：
// 文案、展示顺序、哪个是主操作。

/**
 * 动作 → 按钮文案。
 *
 * 键必须是全量 Record：后端枚举新增动作时，./order.ts 的 wire 投影表先编译期报错，
 * 扩到领域联合后这里接着报错——一路逼着你补文案，不会静默少一个按钮。
 */
export const ORDER_ACTION_META: Record<OrderAction, { label: string }> = {
    pay: { label: "去付款" },
    cancel: { label: "取消订单" },
    remind: { label: "提醒发货" },
    logistics: { label: "查看物流" },
    confirm: { label: "确认收货" },
    rebuy: { label: "再买一单" },
    add_cart: { label: "加入购物车" },
    ship: { label: "发货" },
}

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
    "remind",
    "logistics",
    "confirm",
    "rebuy",
    "add_cart",
    "ship",
]

/**
 * 前端附加动作：后端状态机不会产生的那些（导航/加购/占位提醒），按页面 + 状态追加。
 *
 * 与后端动作分开写是故意的："待发货除了取消，还多给一个提醒发货"是我们自己的产品决定，
 * 不该掺进后端动作集；反过来后端给的新动作也不需要改这里。
 */
const CARD_UI_ACTIONS: Partial<Record<OrderStatus, readonly OrderAction[]>> = {
    pending_shipment: ["remind"],
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
 * 订单内商品行上的操作。`after_sale` 要过 canApplyAfterSale 这道门槛才渲染
 * （见 OrderShopSection：门槛不成立时整条不给，而不是渲染成点不动的禁用灰）。
 */
export const ORDER_ITEM_ACTIONS: ReadonlyArray<{ key: string; label: string }> = [
    { key: "add_cart", label: "加入购物车" },
    { key: "after_sale", label: "申请售后" },
]

// ---------- 售后 ----------

/** 售后类型 → 展示名（申请时买家二选一：货留不留） */
export const AFTER_SALE_TYPE_LABEL: Record<TicketType, string> = {
    REFUND_ONLY: "仅退款",
    RETURN_REFUND: "退货退款",
}

/** 申请入口的引导语：按类型说清「货怎么走」，避免买家把仅退款理解成退货退款 */
export const AFTER_SALE_TYPE_HINT: Record<TicketType, string> = {
    REFUND_ONLY: "不寄回商品，卖家同意后直接退款",
    RETURN_REFUND: "需要寄回商品，卖家确认收货后退款",
}

/** 类型单选的展示顺序：仅退款在前（更轻的那条路先给） */
export const AFTER_SALE_TYPE_ORDER: TicketType[] = ["REFUND_ONLY", "RETURN_REFUND"]

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

/** 买家对售后单能做的动作 → 按钮文案（「填写/修改退货物流」的差别在组件里按是否已填单判定） */
export const AFTER_SALE_ACTION_LABEL: Record<AfterSaleAction, string> = {
    cancel: "撤销申请",
    return: "填写退货物流",
    track: "查看退货物流",
}
