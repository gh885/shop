import type { BuyerOrderDetail, BuyerOrderLineView, BuyerOrderSummary } from "@shop/api/sdk"

import { closedStatus, toMainProgressFromWire, toStatusFromWire } from "./order-status"
import type { OrderDetail, OrderItem, Trade, TradeOrder } from "./rules"

function toOrderItem(line: BuyerOrderLineView): OrderItem {
    return {
        lineNo: line.lineNo,
        skuId: line.skuId,
        title: line.title,
        image: line.imageUrl,
        specValuesJson: line.specValuesJson,
        quantity: line.quantity,
        shippedQuantity: line.shippedQty,
        receivedQuantity: line.receivedQty,
        price: line.unitAmount,
        amount: line.payableAmount,
    }
}

function toTradeOrder(dto: BuyerOrderDetail["sellerOrders"][number]): TradeOrder {
    const closed = dto.closedReason !== ""
    return {
        id: dto.sellerOrderId,
        orderNo: dto.orderNo,
        shopId: dto.shopId,
        fulfillmentStatus: closed
            ? closedStatus(dto.closedReason)
            : toStatusFromWire(dto.fulfillmentStatus),
        closedReason: dto.closedReason,
        items: dto.lines.map(toOrderItem),
        payAmount: dto.payableAmount,
    }
}

export function toTrade(dto: BuyerOrderSummary): Trade {
    return {
        id: dto.orderGroupId,
        tradeNo: dto.groupNo,
        createdAt: dto.createdAt,
        status: toMainProgressFromWire(dto.status),
        // 列表接口不带付款截止时间：倒计时只在详情页出现
        payExpireAt: "",
        payAmount: dto.payableAmount,
    }
}

export function toOrderDetail(dto: BuyerOrderDetail): OrderDetail {
    return {
        id: dto.orderGroupId,
        orderNo: dto.groupNo,
        status: toMainProgressFromWire(dto.status),
        payAmount: dto.payableAmount,
        paid: dto.paid,
        shippingAddressJson: dto.shippingAddressJson,
        payExpireAt: dto.expiresAt,
        createdAt: dto.createdAt,
        orders: dto.sellerOrders.map(toTradeOrder),
    }
}
