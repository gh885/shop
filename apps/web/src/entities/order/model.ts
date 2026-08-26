import { z } from "zod"

import { MoneySchema } from "@shop/api"

/**
 * entities/order 凝聚模块 —— 买家订单领域对象 + 数据层。
 *
 * - 本文件（model.ts）：DTO（私有）+ 业务形状。金额一律 Money（分 + 币种）。
 * - 订单列表按「订单」一条 = 一张卡片，内含若干订单项（行）。多店铺下
 *   订单维度天然挂在店铺上，购物车认店铺分组、订单认订单，二者同构。
 * - OrderDetail 在 Order 之上扩展详情页独有字段（收货人、支付、时间轴等）。
 */

// ---------- 传输层（私有，镜像后端买家侧 wire 形状） ----------

const OrderItemDtoSchema = z.object({
    id: z.uuid(),
    productId: z.uuid(),
    skuId: z.uuid().nullable(),
    name: z.string(),
    image: z.string().nullable(),
    /** 选中规格描述，如「颜色:黑 尺码:M」 */
    spec: z.string().nullable(),
    /** 促销/服务标签行，如「退货宝 大促价保 7天无理由退换」 */
    tags: z.array(z.string()).nullable(),
    price: MoneySchema,
    originalPrice: MoneySchema.nullable(),
    quantity: z.number().int().min(1),
})

/** 订单状态：与后端枚举对齐 */
export const OrderStatusSchema = z.enum([
    "pending_payment", // 待付款
    "pending_shipment", // 待发货
    "pending_receipt", // 待收货
    "pending_review", // 待评价
    "completed", // 已完成 / 交易成功
    "cancelled", // 已取消
    "refunding", // 退款中
])
export type OrderStatus = z.infer<typeof OrderStatusSchema>

const OrderDtoSchema = z.object({
    id: z.uuid(),
    /** 订单号（展示用，不截断） */
    orderNo: z.string(),
    /** 下单时间 ISO */
    createdAt: z.string(),
    status: OrderStatusSchema,
    shopId: z.uuid(),
    shopName: z.string(),
    items: z.array(OrderItemDtoSchema),
    /** 商品总额（若干行合计） */
    totalAmount: MoneySchema,
    /** 实付金额 = 商品总额 + 运费 - 优惠，最终结算口径 */
    payAmount: MoneySchema,
    shippingFee: MoneySchema.nullable(),
    itemCount: z.number().int().min(1),
})

/** 详情页独有字段（列表接口不返回） */
const OrderDetailDtoSchema = OrderDtoSchema.extend({
    /** 收货人信息（下单时快照） */
    receiver: z
        .object({
            name: z.string(),
            /** 手机号脱敏，如 195****1956 */
            phone: z.string(),
            /** 省市区 + 详细地址拼接 */
            address: z.string(),
        })
        .nullable(),
    /** 支付方式名，如「支付宝」；未付款为 null */
    payMethod: z.string().nullable(),
    /** 第三方支付交易号 */
    payTxnNo: z.string().nullable(),
    /** 订单服务，如「假一赔四」等 */
    services: z.array(z.string()).nullable(),
    payTime: z.string().nullable(),
    shipTime: z.string().nullable(),
    finishTime: z.string().nullable(),
})

// ---------- 业务层（归一空值，渲染层无需再判空） ----------

/** 订单项业务形状 */
function toItem(dto: z.infer<typeof OrderItemDtoSchema>) {
    return {
        id: dto.id,
        productId: dto.productId,
        skuId: dto.skuId,
        title: dto.name,
        image: dto.image ?? "",
        spec: dto.spec ?? "",
        tags: dto.tags ?? [],
        price: dto.price,
        originalPrice: dto.originalPrice,
        quantity: dto.quantity,
    }
}
export type OrderItem = ReturnType<typeof toItem>

export const OrderSchema = OrderDtoSchema.transform((dto) => ({
    id: dto.id,
    orderNo: dto.orderNo,
    createdAt: dto.createdAt,
    status: dto.status,
    shopId: dto.shopId,
    shopName: dto.shopName,
    items: dto.items.map(toItem),
    totalAmount: dto.totalAmount,
    payAmount: dto.payAmount,
    shippingFee: dto.shippingFee,
    itemCount: dto.itemCount,
}))
export type Order = z.infer<typeof OrderSchema>

/** 订单详情业务形状（在列表形状之上扩展详情字段） */
export const OrderDetailSchema = OrderDetailDtoSchema.transform((dto) => ({
    ...OrderSchema.parse(dto),
    receiver: dto.receiver ?? { name: "", phone: "", address: "" },
    payMethod: dto.payMethod ?? "",
    payTxnNo: dto.payTxnNo ?? "",
    services: dto.services ?? [],
    payTime: dto.payTime ?? "",
    shipTime: dto.shipTime ?? "",
    finishTime: dto.finishTime ?? "",
}))
export type OrderDetail = z.infer<typeof OrderDetailSchema>

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
