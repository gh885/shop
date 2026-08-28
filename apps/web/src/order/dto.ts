import { z } from "zod"

import { MoneySchema } from "@shop/api"
import type { Order, OrderDetail, OrderItem, OrderStatus } from "./model"

/**
 * entities/order 数据层 —— DTO（wire 形状）+ zod 校验 + wire→业务形状组装。
 * 镜像后端买家侧订单接口出参。领域规则不在这，见 model.ts。
 */

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

/** 订单项 wire → 业务形状（null 归一） */
function toItem(dto: z.infer<typeof OrderItemDtoSchema>): OrderItem {
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

/** 订单 wire → 业务形状 */
export function dtoToOrder(dto: z.infer<typeof OrderDtoSchema>): Order {
    return {
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
    }
}

/** 订单详情 wire → 业务形状（在列表形状之上扩展详情字段，null 归一空值） */
export function dtoToOrderDetail(dto: z.infer<typeof OrderDetailDtoSchema>): OrderDetail {
    return {
        ...dtoToOrder(dto),
        receiver: dto.receiver ?? { name: "", phone: "", address: "" },
        payMethod: dto.payMethod ?? "",
        payTxnNo: dto.payTxnNo ?? "",
        services: dto.services ?? [],
        payTime: dto.payTime ?? "",
        shipTime: dto.shipTime ?? "",
        finishTime: dto.finishTime ?? "",
    }
}

export type { OrderStatus }
