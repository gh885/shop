import type {
    OrderAvailableAction,
    OrderDetailResponse,
    OrderItemResponse,
    OrderListItemResponse,
} from "@shop/api/sdk"

import { strikethroughPrice } from "@shop/common/domain"
import { toStatusFromWire } from "./order-status"
import type { Order, OrderAction, OrderDetail, OrderItem } from "./model"

/**
 * order/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。
 *
 * 与 model.ts 的分工：这里把生成 SDK 的 wire 形状归一成领域形状；领域类型与纯规则在 model.ts。
 * 自后端收紧 OpenAPI 契约（response 字段已标 required / nullable）后：
 *   - required 字段：契约保证必有，mapping 不再兜底（去掉 ?? "" / ?? 0）。
 *   - nullable 字段：契约明确可空，如实透传 null，由 UI 层处理「无」的展示（不再 ?? "" 造假）。
 * 金额一律 Money；成交价/小计等由契约保证非空。划线价是唯一被投影改写的金额字段：
 * 契约可空，且「等于成交价」（后端允许相等，PRD-39）在这里一并折成「没有」——只有让过钱的原价才配删除线。
 * 入参直接用 SDK 生成的 DTO 类型（行项形状单一事实来源在 types.gen，不手抄）。
 */

/**
 * 后端动作（wire 大写）→ 领域动作（小写）。
 *
 * 全量 Record 而非 Partial：后端枚举加一个动作时这里先编译期红（"没处理新动作"被看见），
 * 而不是静默少渲染一个按钮。SHIP 是卖家视角动作——买家接口不会下发它，落到这里就丢弃。
 */
const ACTION_BY_WIRE: Record<OrderAvailableAction, OrderAction | undefined> = {
    PAY: "pay",
    CANCEL: "cancel",
    RECEIVE: "confirm",
    SHIP: undefined,
}

/** 动作集 wire → 领域：保序过滤，不在前端补动作（前端附加动作由 deriveOrderActions 拼在后面） */
export function toOrderActions(wire: readonly OrderAvailableAction[]): OrderAction[] {
    return wire
        .map((action) => ACTION_BY_WIRE[action])
        .filter((a): a is OrderAction => a !== undefined)
}

/** 行项 wire → 业务：快照字段归一 */
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

/** 列表项 wire → 业务：列表项已内嵌行项目。
 *  列表契约只有净额 `payAmount`，没有商品额/运费/优惠的拆分——所以这里只能拿净额顶 `itemAmount`、
 *  运费留空；**详情投影必须用详情契约的四件套把这些覆盖掉**，否则金额三行永远加不起来。 */
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

/** 详情 wire → 业务：在列表形状之上扩展详情字段（收货快照、物流、时间戳、可执行动作），可空如实透传。
 *  金额四件套以详情契约为准（列表只有净额），这样「商品总价 + 运费 − 优惠 = 实付款」才对得上。 */
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
