import type {
    OrderAvailableAction,
    OrderDetailResponse,
    OrderItemResponse,
    TradeListItemResponse,
    TradeOrderResponse,
} from "@shop/api/sdk"

import { strikethroughPrice } from "@shop/common/domain"
import { toAfterSaleBadgeFromWire, toMainProgressFromWire, toStatusFromWire } from "./order-status"
import type { OrderAction, OrderDetail, OrderItem, Trade, TradeOrder } from "./model"

const ACTION_BY_WIRE: Record<OrderAvailableAction, OrderAction | undefined> = {
    CANCEL: "cancel",
    RECEIVE: "confirm",
    // 发货是卖家视角的动作，买家侧永远不下发
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
        shippedQuantity: dto.shippedQuantity,
        refundedQuantity: dto.refundedQuantity,
        amount: dto.amount,
    }
}

function toTradeOrder(dto: TradeOrderResponse): TradeOrder {
    return {
        id: dto.id,
        orderNo: dto.orderNo,
        shopId: dto.shopId,
        shopName: dto.shopName,
        status: toStatusFromWire(dto.status),
        items: dto.items.map(toOrderItem),
        availableActions: toOrderActions(dto.availableActions),
        payAmount: dto.payAmount,
        shipExpireAt: dto.shipExpireAt,
    }
}

export function toTrade(dto: TradeListItemResponse): Trade {
    return {
        id: dto.id,
        tradeNo: dto.tradeNo,
        createdAt: dto.createdAt,
        mainProgress: toMainProgressFromWire(dto.mainProgress),
        afterSaleBadge: toAfterSaleBadgeFromWire(dto.afterSaleBadge),
        payExpireAt: dto.payExpireAt,
        payAmount: dto.payAmount,
        orders: dto.orders.map(toTradeOrder),
    }
}

/**
 * 详情页的状态口径：主订单没付款时显示「待付款」。
 *
 * <p>子订单创建即待发货（§5.1），未付款这件事只存在于主订单上；详情页标题若照抄子订单状态，
 * 未支付的单会显示成「待发货」。这里把两个事实收敛成一个字面量，页面里不必再判一次 tradeStatus。
 */
export function toOrderDetail(dto: OrderDetailResponse): OrderDetail {
    const pendingPayment = dto.tradeStatus === "PENDING_PAYMENT"
    return {
        ...dto,
        status: pendingPayment ? "pending_payment" : toStatusFromWire(dto.status),
        afterSaleBadge: toAfterSaleBadgeFromWire(dto.afterSaleBadge),
        items: dto.items.map(toOrderItem),
        availableActions: toOrderActions(dto.availableActions),
    }
}
