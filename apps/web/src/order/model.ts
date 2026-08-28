import type { Money } from "@shop/api"

/**
 * entities/order 领域层 —— 订单业务类型 + 纯规则，不知道 wire 的一切。
 *
 * - 本文件（model.ts）：业务类型 + 纯规则，不 import zod / wire DTO。
 * - 传输 DTO、zod 校验、wire→业务形状组装在 ./dto.ts（数据层）。
 * 金额一律 Money（分 + 币种），不裸传 number。
 */

// ---------- 业务类型 ----------

/** 订单状态：与后端枚举对齐 */
export type OrderStatus =
    | "pending_payment" // 待付款
    | "pending_shipment" // 待发货
    | "pending_receipt" // 待收货
    | "pending_review" // 待评价
    | "completed" // 已完成 / 交易成功
    | "cancelled" // 已取消
    | "refunding" // 退款中

/** 订单项业务形状 */
export type OrderItem = {
    id: string
    productId: string
    skuId: string | null
    title: string
    image: string
    /** 选中规格描述，如「颜色:黑 尺码:M」 */
    spec: string
    /** 促销/服务标签行，如「退货宝 大促价保 7天无理由退换」 */
    tags: string[]
    price: Money
    originalPrice: Money | null
    quantity: number
}

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
    totalAmount: Money
    /** 实付金额 = 商品总额 + 运费 - 优惠，最终结算口径 */
    payAmount: Money
    shippingFee: Money | null
    itemCount: number
}

/** 订单详情业务形状（在列表形状之上扩展详情字段，null 归一空值） */
export type OrderDetail = Order & {
    /** 收货人信息（下单时快照） */
    receiver: { name: string; phone: string; address: string }
    /** 支付方式名，如「支付宝」；未付款为空 */
    payMethod: string
    /** 第三方支付交易号 */
    payTxnNo: string
    /** 订单服务，如「假一赔四」等 */
    services: string[]
    payTime: string
    shipTime: string
    finishTime: string
}

// ---------- 展示辅助 ----------

/** 状态 → 中文展示名 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
    pending_payment: "待付款",
    pending_shipment: "待发货",
    pending_receipt: "待收货",
    pending_review: "待评价",
    completed: "交易成功",
    cancelled: "已取消",
    refunding: "退款中",
}

/** 订单状态 → 进度条当前停留的步骤下标（0 起步） */
export const ORDER_PROGRESS_STEP: Record<OrderStatus, number> = {
    pending_payment: 0, // 已拍下，待付款
    pending_shipment: 1, // 已付款，待发货
    pending_receipt: 2, // 已发货，待收货
    pending_review: 3, // 已收货，待评价
    completed: 4, // 全流程完成
    cancelled: -1, // 取消：不按进度展示
    refunding: 2, // 退款中：近似在收货环节
}

/** 进度条步骤名（固定四步，与截图一致） */
export const ORDER_PROGRESS_STEPS = ["拍下宝贝", "买家付款", "卖家发货", "确认收货"] as const

/** 详情页「订单信息」里的时间项（值为空表示未发生，展示占位） */
export interface OrderTimelineItem {
    key: string
    label: string
    value: string
}
