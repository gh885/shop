import type { Money, OrderDetailResponse } from "@shop/api/sdk"

import {
    ORDER_ACTION_META,
    ORDER_ACTION_ORDER,
    ORDER_PRIMARY_ACTION,
    ORDER_UI_ACTIONS,
} from "./constants"

/**
 * entities/order 领域层 —— 订单业务类型 + 纯规则，不知道 wire 的一切。
 *
 * - 本文件（model.ts）：业务类型 + 动作 key + 纯规则，不 import zod。
 * - 展示文案 / 色板 / 动作表在 ./constants.ts；wire 拼接 / 投影在 ./order.ts（数据层）。
 * 金额一律 Money（分 + 币种），不裸传 number。
 */

// 业务类型
// 订单状态类型与 wire↔领域映射收在 order 域内（./order-status），此处复用
import type { OrderStatus } from "./order-status"

export type { OrderStatus } from "./order-status"

/** 订单项业务形状（快照字段原样透出；amount 为行小计 = 单价 × 数量）。
 * 注意：后端行项无 id（订单快照只留 productId/skuId），渲染 key 用 `productId + skuId + quantity`。 */
export type OrderItem = {
    /** 订单行主键：逐行引用的动作（评价按行打分）靠它，不用 skuId 顶替——同一 SKU 买两件是两个行 */
    orderItemId: string
    productId: string
    skuId: string
    title: string
    /** 主图（SDK 可空，UI 用占位图） */
    image?: string
    price: Money
    /** 可画的划线价：下单时没有、或与成交价相等都归成「没有」（UI 有值就画删除线） */
    originalPrice?: Money
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
    /** 发货时限（付款时回填；未付款为 null）。只用于提醒——到期不由系统代关单，取消权在买家手上（ORD-27） */
    shipExpireAt: string | null
    shopId: string
    /** 店铺注销时后端诚实返回 null（@Schema nullable），UI 显示「店铺已关闭」 */
    shopName: string | null
    items: OrderItem[]
    /**
     * 可执行动作：**后端状态机算的**（列表与详情契约都带 availableActions）。
     *
     * 前端不再按 status 另推一张「状态 → 按钮」表：那张表曾经与后端漂移
     * （后端认为待发货可 CANCEL，前端只给了「提醒发货」），
     * 这里只负责文案、顺序与主次。
     */
    availableActions: OrderAction[]
    /** 商品总额（若干行合计） */
    itemAmount: Money
    /** 运费（V1 恒 0） */
    shippingFee?: Money
    /** 实付金额 = 商品总额 + 运费 - 优惠，最终结算口径 */
    payAmount: Money
}

/**
 * 订单详情业务形状 = Order 之上叠加详情契约的增量字段。
 * 详情契约（OrderDetailResponse）是列表契约的超集：除 status/items 已在 Order 里归一外
 * 其余字段同名同型，直接 Omit 组合，不逐字段抄书。
 * 金额四件套（itemAmount / shippingFee / discountAmount / payAmount）以详情契约为准，
 * 这样「商品总价 + 运费 − 优惠 = 实付款」才对得上。
 */
export type OrderDetail = Order & Omit<OrderDetailResponse, "status" | "items" | "availableActions">

/**
 * 待发货单是否已过发货时限。
 *
 * 过点**不**触发任何系统动作（ORD-27：到期自动取消会误杀买家还想要的单）——它只把一句话变得该说：
 * 「商家已超时，你可以取消并退款」。没有时限数据（未付款单）一律 false。
 */
export function isShipOverdue(
    order: Pick<Order, "shipExpireAt">,
    now: number = Date.now(),
): boolean {
    return order.shipExpireAt !== null && new Date(order.shipExpireAt).getTime() < now
}

/** 一单的件数（逐行 quantity 求和）：卡片上「共 N 件」那一行的唯一算法 */
export function orderTotalQuantity(items: readonly Pick<OrderItem, "quantity">[]): number {
    return items.reduce((sum, item) => sum + item.quantity, 0)
}

/**
 * 订单行的渲染 key：后端行项没有 id，快照只留 productId/skuId（见 {@link OrderItem}）。
 *  同一 SKU 买两件是两个行，所以 quantity 也在 key 里。 */
export function orderItemKey(item: Pick<OrderItem, "productId" | "skuId" | "quantity">): string {
    return `${item.productId}-${item.skuId}-${item.quantity}`
}

/**
 * 收货地址折成一行。
 *
 * 四段在订单快照上是四列，展示时永远连读，所以拼接口径只有一处：摘要卡、状态区、
 * 物流页此前各写一遍（两处 `+`、一处模板字符串），改口径时只有其中一处会跟着变。
 */
export function receiverFullAddress(
    order: Pick<
        OrderDetail,
        "receiverProvince" | "receiverCity" | "receiverDistrict" | "receiverDetail"
    >,
): string {
    return (
        order.receiverProvince + order.receiverCity + order.receiverDistrict + order.receiverDetail
    )
}

/**
 * 订单按钮上的动作。
 *
 * 前四个是后端状态机给的（`availableActions`，wire 大写，经 ./order.ts 投影成小写）：
 * pay/cancel/confirm 对应 PAY/CANCEL/RECEIVE；ship 只出现在卖家视角，买家页面不会渲染。
 * 后三个是纯前端交互词汇，后端永远不会产生：rebuy（导航去商品）、add_cart（跳加购）、
 * logistics（跳物流页）。
 *
 * 这里曾有 `remind`（提醒发货）——**已删**：全站没有消息通道，那个按钮点了什么都不发生；
 * 发货时限的提醒改由卡片文案承担（ORD-27），不再挂一个做不到的动作。
 */
export type OrderAction = "pay" | "cancel" | "confirm" | "ship" | "rebuy" | "add_cart" | "logistics"

/** 哪个页面在画按钮排：卡片与详情页的动作集差异写在 constants 的表里，不埋在副本里 */
export type OrderActionSurface = "card" | "detail"

/** 一个动作按钮的声明（主操作用 default，其余描边） */
export interface OrderActionItem {
    key: OrderAction
    label: string
    variant?: "default" | "outline"
}

/**
 * 按钮排 = 后端给的动作 + 本页附加的前端动作，顺序按 ORDER_ACTION_ORDER 固定。
 *
 * 后端给的是**集合**（谁的出边算谁的），画出来必须稳定；
 * 主操作（橙色）只看页面与状态——一屏只应该有一个主行动。
 */
export function deriveOrderActions(
    order: Pick<Order, "status" | "availableActions">,
    surface: OrderActionSurface,
): OrderActionItem[] {
    const wanted = new Set<OrderAction>([
        ...order.availableActions,
        ...(ORDER_UI_ACTIONS[surface][order.status] ?? []),
    ])
    const primary = ORDER_PRIMARY_ACTION[surface][order.status]
    return ORDER_ACTION_ORDER.filter((key) => wanted.has(key)).map((key) => ({
        key,
        label: ORDER_ACTION_META[key].label,
        variant: key === primary ? "default" : undefined,
    }))
}
