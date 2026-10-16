import type {
    OrderAvailableAction,
    OrderDetailResponse,
    OrderItemResponse,
    OrderListItemResponse,
} from "@shop/api/sdk"

import { strikethroughPrice } from "@shop/common/domain"
import { toStatusFromWire } from "./order-status"
import type { Order, OrderAction, OrderDetail, OrderItem } from "./model"

const ACTION_BY_WIRE: Record<OrderAvailableAction, OrderAction | undefined> = {
    PAY: "pay",
    CANCEL: "cancel",
    RECEIVE: "confirm",
    SHIP: undefined,
}

export function toOrderActions(wire: readonly OrderAvailableAction[]): OrderAction[] {
    return wire
        .map((action) => ACTION_BY_WIRE[action])
        .filter((a): a is OrderAction => a !== undefined)
}

function toOrderItem(dto: OrderItemResponse): OrderItem {
    return {
        orderItemId: dto.orderItemId,
        productId: dto.productId,
        skuId: dto.skuId,
        title: dto.name,
        image: dto.image ?? undefined,
        price: dto.price,
        originalPrice: strikethroughPrice(dto.originalPrice, dto.price),
        quantity: dto.quantity,
        amount: dto.amount,
    }
}

export function toOrder(dto: OrderListItemResponse): Order {
    return {
        id: dto.id,
        orderNo: dto.orderNo,
        createdAt: dto.createdAt,
        status: toStatusFromWire(dto.status),
        payExpireAt: dto.payExpireAt,
        shipExpireAt: dto.shipExpireAt,
        shopId: dto.shopId,
        shopName: dto.shopName,
        items: dto.items.map(toOrderItem),
        availableActions: toOrderActions(dto.availableActions),
        itemAmount: dto.payAmount,
        shippingFee: undefined,
        payAmount: dto.payAmount,
    }
}

export function toOrderDetail(dto: OrderDetailResponse): OrderDetail {
    return {
        ...toOrder(dto),
        itemAmount: dto.itemAmount,
        shippingFee: dto.shippingFee,
        discountAmount: dto.discountAmount,
        userCouponId: dto.userCouponId,
        afterSaleStatus: dto.afterSaleStatus,
        applyExpireAt: dto.applyExpireAt,
        receiveExpireAt: dto.receiveExpireAt,
        canExtendReceive: dto.canExtendReceive,
        refundAmount: dto.refundAmount,
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
