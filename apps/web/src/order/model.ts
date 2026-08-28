import type { Money } from "@shop/api"

/**
 * entities/order 领域层 —— 订单业务类型 + 纯规则，不知道 wire 的一切。
 *
 * - 本文件（model.ts）：业务类型 + 纯规则，不 import zod / wire DTO。
 * - wire 拼接 / 投影在 ./order.ts（数据层），从生成 SDK 取，不手写 zod。
 * 金额一律 Money（分 + 币种），不裸传 number。
 */

// ---------- 业务类型 ----------

/** 订单状态：与后端枚举对齐（已付款即进入履约流，无待评价/退款中阶段） */
export type OrderStatus =
    | "pending_payment" // 待付款
    | "pending_shipment" // 待发货
    | "pending_receipt" // 待收货
    | "completed" // 已完成 / 交易成功
    | "cancelled" // 已取消

/** 订单项业务形状（快照字段原样透出；amount 为行小计 = 单价 × 数量）。
 * 注意：后端行项无 id（订单快照只留 productId/skuId），渲染 key 用 `productId + skuId + quantity`。 */
export type OrderItem = {
    productId: string
    skuId: string | null
    title: string
    image: string
    price: Money
    originalPrice: Money | null
    quantity: number
    /** 行小计（单价 × 数量） */
    amount: Money
}

/** 订单业务形状：列表项已内嵌行项目，金额三件套（itemAmount/shippingFee/payAmount） */
export type Order = {
    id: string
    /** 订单号（展示用，不截断） */
    orderNo: string
    /** 下单时间 ISO */
    createdAt: string
    status: OrderStatus
    shopId: string
    shopName: string
    items: OrderItem[]
    /** 商品总额（若干行合计） */
    itemAmount: Money
    /** 运费（V1 恒 0） */
    shippingFee: Money | null
    /** 实付金额 = 商品总额 + 运费 - 优惠，最终结算口径 */
    payAmount: Money
}

/** 订单详情业务形状（在列表形状之上扩展详情字段，null 归一空值） */
export type OrderDetail = Order & {
    /** 可执行动作：按后端状态机推导（pay/cancel/receive/...） */
    availableActions: string[]
    /** 买家留言（下单定格） */
    buyerMessage: string
    /** 收货快照（下单定格；卖家侧即面单信息） */
    receiverName: string
    receiverPhone: string
    receiverProvince: string
    receiverCity: string
    receiverDistrict: string
    receiverDetail: string
    /** 物流回填 */
    logisticsCompany: string
    trackingNo: string
    /** 付款截止（倒计时） */
    payExpireAt: string
    paidAt: string
    shippedAt: string
    completedAt: string
    cancelledAt: string
    cancelReason: string
}

// ---------- 展示辅助 ----------

/** 状态 → 中文展示名 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
    pending_payment: "待付款",
    pending_shipment: "待发货",
    pending_receipt: "待收货",
    completed: "交易成功",
    cancelled: "已取消",
}

/** 订单状态 → 进度条当前停留的步骤下标（0 起步） */
export const ORDER_PROGRESS_STEP: Record<OrderStatus, number> = {
    pending_payment: 0, // 已拍下，待付款
    pending_shipment: 1, // 已付款，待发货
    pending_receipt: 2, // 已发货，待收货
    completed: 3, // 全流程完成
    cancelled: -1, // 取消：不按进度展示
}

/** 进度条步骤名（固定四步，与截图一致） */
export const ORDER_PROGRESS_STEPS = ["拍下宝贝", "买家付款", "卖家发货", "确认收货"] as const

/** 详情页「订单信息」里的时间项（值为空表示未发生，展示占位） */
export interface OrderTimelineItem {
    key: string
    label: string
    value: string
}
