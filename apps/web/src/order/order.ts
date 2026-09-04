import type { Money } from "@shop/api"
import type { Money as SdkMoney } from "@shop/api/sdk"

import { toStatusFromWire, statusToWire } from "#/shared/order-status"
import type { Order, OrderDetail, OrderItem } from "./model"

/**
 * entities/order —— 订单领域数据层（纯类型 + wire → 投影 + 纯规则，不碰 React / 网络）。
 *
 * 与 model.ts 的分工：这里把生成 SDK 的 wire 形状归一成领域形状。
 * 自后端收紧 OpenAPI 契约（response 字段已标 required / nullable）后：
 *   - required 字段：契约保证必有，mapping 不再兜底（去掉 ?? "" / ?? 0）。
 *   - nullable 字段：契约明确可空，如实透传 null，由 UI 层处理「无」的展示（不再 ?? "" 造假）。
 * 金额一律 Money，SDK 的 Money 现已 required 且非 null，toMoney 原样透传。
 */

// ---------- 状态映射（后端枚举大写 → 前端领域枚举小写，双向） ----------
// 状态机唯一真相在 #/shared/order-status（toStatusFromWire / statusToWire）

/** wire → 领域：后端状态归一成前端枚举（真实语义投影，保留） */
const toStatus = toStatusFromWire

export { statusToWire }

/** 归一：SDK 的 Money 现已 required 且非 null，原样透传 */
function toMoney(m: SdkMoney): Money {
    return { amount: m.amount, currency: m.currency }
}

/** 行项 wire → 业务：快照字段归一 */
function toOrderItem(dto: {
    productId: string
    skuId: string
    name: string
    image: string | null
    price: SdkMoney
    originalPrice: SdkMoney
    quantity: number
    amount: SdkMoney
}): OrderItem {
    return {
        productId: dto.productId,
        skuId: dto.skuId,
        title: dto.name,
        image: dto.image ?? undefined,
        price: toMoney(dto.price),
        originalPrice: toMoney(dto.originalPrice),
        quantity: dto.quantity,
        amount: toMoney(dto.amount),
    }
}

/** 列表项 wire → 业务：列表项已内嵌行项目，金额三件套直接透传 */
export function toOrder(dto: {
    id: string
    orderNo: string
    status: string
    shopId: string
    shopName: string | null
    payAmount: SdkMoney
    payExpireAt: string
    createdAt: string
    items: Array<{
        productId: string
        skuId: string
        name: string
        image: string | null
        price: SdkMoney
        originalPrice: SdkMoney
        quantity: number
        amount: SdkMoney
    }>
}): Order {
    return {
        id: dto.id,
        orderNo: dto.orderNo,
        createdAt: dto.createdAt,
        status: toStatus(dto.status),
        payExpireAt: dto.payExpireAt,
        shopId: dto.shopId,
        shopName: dto.shopName,
        items: dto.items.map(toOrderItem),
        itemAmount: toMoney(dto.payAmount),
        shippingFee: undefined,
        payAmount: toMoney(dto.payAmount),
    }
}

/** 详情 wire → 业务：在列表形状之上扩展详情字段（收货快照、物流、时间戳、可执行动作），可空如实透传 */
export function toOrderDetail(dto: {
    id: string
    orderNo: string
    status: string
    shopId: string
    shopName: string | null
    availableActions: Array<string>
    itemAmount: SdkMoney
    shippingFee: SdkMoney
    payAmount: SdkMoney
    buyerMessage: string | null
    receiverName: string
    receiverPhone: string
    receiverProvince: string
    receiverCity: string
    receiverDistrict: string
    receiverDetail: string
    logisticsCompany: string | null
    trackingNo: string | null
    payExpireAt: string
    paidAt: string | null
    shippedAt: string | null
    completedAt: string | null
    cancelledAt: string | null
    cancelReason: string | null
    createdAt: string
    items: Array<{
        productId: string
        skuId: string
        name: string
        image: string | null
        price: SdkMoney
        originalPrice: SdkMoney
        quantity: number
        amount: SdkMoney
    }>
}): OrderDetail {
    return {
        ...toOrder(dto),
        availableActions: dto.availableActions,
        buyerMessage: dto.buyerMessage,
        receiverName: dto.receiverName,
        receiverPhone: dto.receiverPhone,
        receiverProvince: dto.receiverProvince,
        receiverCity: dto.receiverCity,
        receiverDistrict: dto.receiverDistrict,
        receiverDetail: dto.receiverDetail,
        logisticsCompany: dto.logisticsCompany,
        trackingNo: dto.trackingNo,
        paidAt: dto.paidAt,
        shippedAt: dto.shippedAt,
        completedAt: dto.completedAt,
        cancelledAt: dto.cancelledAt,
        cancelReason: dto.cancelReason,
    }
}
