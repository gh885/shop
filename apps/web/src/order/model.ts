import type { Money } from "@shop/common"
import type { AfterSaleStatus } from "@shop/api/sdk"

/**
 * entities/order 领域层 —— 订单业务类型 + 纯规则，不知道 wire 的一切。
 *
 * - 本文件（model.ts）：业务类型 + 纯规则，不 import zod / wire DTO。
 * - wire 拼接 / 投影在 ./order.ts（数据层），从生成 SDK 取，不手写 zod。
 * 金额一律 Money（分 + 币种），不裸传 number。
 */

// ---------- 业务类型 ----------

// 订单状态类型与 wire↔领域映射收在包级 shared（#/shared/order-status），此处复用
import type { OrderStatus } from "#/shared/order-status"

export type { OrderStatus } from "#/shared/order-status"

/** 订单项业务形状（快照字段原样透出；amount 为行小计 = 单价 × 数量）。
 * 注意：后端行项无 id（订单快照只留 productId/skuId），渲染 key 用 `productId + skuId + quantity`。 */
export type OrderItem = {
    productId: string
    skuId: string
    title: string
    /** 主图（SDK 可空，UI 用占位图） */
    image?: string
    price: Money
    /** 划线价：SDK 可空，null 表示下单时就没有划线价（UI 不画那行删除线） */
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
    /** 付款截止（待付款订单倒计时用；已付款为空） */
    payExpireAt: string
    shopId: string
    /** 店铺注销时后端诚实返回 null（@Schema nullable），UI 显示「店铺已关闭」 */
    shopName: string | null
    items: OrderItem[]
    /** 商品总额（若干行合计） */
    itemAmount: Money
    /** 运费（V1 恒 0） */
    shippingFee?: Money
    /** 实付金额 = 商品总额 + 运费 - 优惠，最终结算口径 */
    payAmount: Money
}

/** 订单详情业务形状（在列表形状之上扩展详情字段，undefined 归一空值） */
export type OrderDetail = Order & {
    /**
     * 券减免（详情契约独有）。
     *
     * 列表契约只给净额 payAmount，拿不到明细；详情契约有四件套
     * （itemAmount / shippingFee / discountAmount / payAmount），
     * 必须自洽：`商品总价 + 运费 − 优惠 = 实付款`。
     */
    discountAmount: Money
    /** 本单核销的券 id（未用券为 null） */
    userCouponId: string | null
    /** 可执行动作：按后端状态机推导（pay/cancel/receive/...） */
    availableActions: string[]
    /**
     * 售后投影：最近一张售后单的状态（NONE = 从未申请过）。
     * 只有详情契约带它（列表契约没有），所以它是详情字段而不是订单字段。
     */
    afterSaleStatus: AfterSaleStatus
    /** 售后申请截止时刻（契约可空：未完成 / 窗口已过由后端算） */
    applyExpireAt: string | null
    /** 最近一次售后的退款口径（未申请过为 null） */
    refundAmount: Money | null
    /** 买家留言（下单定格；可空） */
    buyerMessage: string | null
    /** 收货快照（下单定格；卖家侧即面单信息） */
    receiverName: string
    receiverPhone: string
    receiverProvince: string
    receiverCity: string
    receiverDistrict: string
    receiverDetail: string
    /** 物流回填（未发货前均为 null） */
    logisticsCompany: string | null
    trackingNo: string | null
    paidAt: string | null
    shippedAt: string | null
    completedAt: string | null
    cancelledAt: string | null
    cancelReason: string | null
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
