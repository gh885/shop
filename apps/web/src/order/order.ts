import type { Money } from "@shop/api"
import type { Money as SdkMoney } from "@shop/api/sdk"

import type { Order, OrderDetail, OrderItem } from "./model"

/**
 * entities/order —— 订单领域数据层（纯类型 + wire → 投影 + 纯规则，不碰 React / 网络）。
 *
 * 与 model.ts 的分工：这里把生成 SDK 的 wire 形状（字段全可选）归一成领域形状（稳定缺省），
 * model.ts 只定义领域类型与展示辅助。金额一律 Money，wire 的 SDK Money 字段可选，经 toMoney 归一必填。
 */

/** 归一：SDK 的 Money 字段全可选（openapi-ts 默认），业务 Money 必填；null 原样保留 */
function toMoney(m: SdkMoney | null | undefined): Money | null {
    if (m == null) return null
    return { amount: m.amount ?? 0, currency: m.currency ?? "CNY" }
}

/** 行项 wire → 业务：快照字段归一，null → 空/缺省值 */
export function toOrderItem(dto: {
    productId?: string
    skuId?: string | null
    name?: string
    image?: string | null
    price?: SdkMoney
    originalPrice?: SdkMoney | null
    quantity?: number
    amount?: SdkMoney
}): OrderItem {
    return {
        productId: dto.productId ?? "",
        skuId: dto.skuId ?? null,
        title: dto.name ?? "",
        image: dto.image ?? "",
        price: toMoney(dto.price) ?? { amount: 0, currency: "CNY" },
        originalPrice: toMoney(dto.originalPrice),
        quantity: dto.quantity ?? 0,
        amount: toMoney(dto.amount) ?? { amount: 0, currency: "CNY" },
    }
}

/** 列表项 wire → 业务：列表项已内嵌行项目，金额三件套直接透传（shippingFee 后端可能为 null） */
export function toOrder(dto: {
    id?: string
    orderNo?: string
    status?: string
    shopId?: string
    shopName?: string
    payAmount?: SdkMoney
    payExpireAt?: string
    createdAt?: string
    items?: Array<{
        productId?: string
        skuId?: string | null
        name?: string
        image?: string | null
        price?: SdkMoney
        originalPrice?: SdkMoney | null
        quantity?: number
        amount?: SdkMoney
    }>
}): Order {
    return {
        id: dto.id ?? "",
        orderNo: dto.orderNo ?? "",
        createdAt: dto.createdAt ?? "",
        status: (dto.status ?? "pending_payment") as Order["status"],
        shopId: dto.shopId ?? "",
        shopName: dto.shopName ?? "",
        items: (dto.items ?? []).map(toOrderItem),
        itemAmount: toMoney(dto.payAmount) ?? { amount: 0, currency: "CNY" },
        shippingFee: null,
        payAmount: toMoney(dto.payAmount) ?? { amount: 0, currency: "CNY" },
    }
}

/** 详情 wire → 业务：在列表形状之上扩展详情字段（收货快照、物流、时间戳、可执行动作），null 归一空值 */
export function toOrderDetail(dto: {
    id?: string
    orderNo?: string
    status?: string
    shopId?: string
    shopName?: string
    availableActions?: Array<string>
    itemAmount?: SdkMoney
    shippingFee?: SdkMoney
    payAmount?: SdkMoney
    buyerMessage?: string
    receiverName?: string
    receiverPhone?: string
    receiverProvince?: string
    receiverCity?: string
    receiverDistrict?: string
    receiverDetail?: string
    logisticsCompany?: string
    trackingNo?: string
    payExpireAt?: string
    paidAt?: string
    shippedAt?: string
    completedAt?: string
    cancelledAt?: string
    cancelReason?: string
    createdAt?: string
    items?: Array<{
        productId?: string
        skuId?: string | null
        name?: string
        image?: string | null
        price?: SdkMoney
        originalPrice?: SdkMoney | null
        quantity?: number
        amount?: SdkMoney
    }>
}): OrderDetail {
    return {
        ...toOrder(dto),
        availableActions: dto.availableActions ?? [],
        buyerMessage: dto.buyerMessage ?? "",
        receiverName: dto.receiverName ?? "",
        receiverPhone: dto.receiverPhone ?? "",
        receiverProvince: dto.receiverProvince ?? "",
        receiverCity: dto.receiverCity ?? "",
        receiverDistrict: dto.receiverDistrict ?? "",
        receiverDetail: dto.receiverDetail ?? "",
        logisticsCompany: dto.logisticsCompany ?? "",
        trackingNo: dto.trackingNo ?? "",
        payExpireAt: dto.payExpireAt ?? "",
        paidAt: dto.paidAt ?? "",
        shippedAt: dto.shippedAt ?? "",
        completedAt: dto.completedAt ?? "",
        cancelledAt: dto.cancelledAt ?? "",
        cancelReason: dto.cancelReason ?? "",
    }
}
