import { Button } from "@shop/ui-web"

import type { OrderStatus } from "./model"

/**
 * 订单操作按钮：状态 → 动作清单 + 按钮排渲染，订单列表卡片与详情页共用。
 *
 * 两处曾各写一份「状态 → 动作」表，已经漂移（completed 在详情页有「加入购物车」、列表卡片没有）。
 * 现在只留一份基础表，详情页用 ORDER_DETAIL_ACTIONS 显式声明它额外多给的动作——
 * 差异是被写下来的，而不是埋在副本里。
 */

/** 订单操作 key（封闭联合：分发处 switch/查找表可穷举检查，新增动作编译期可见） */
export type OrderAction =
    | "pay"
    | "cancel"
    | "remind"
    | "logistics"
    | "confirm"
    | "rebuy"
    | "add_cart"

interface OrderActionItem {
    key: OrderAction
    label: string
    /** 主操作用 default（橙），其余描边 */
    variant?: "default" | "outline"
}

/** 基础动作表（列表卡片即用此表） */
const BASE_ACTIONS: Record<OrderStatus, OrderActionItem[]> = {
    pending_payment: [
        { key: "pay", label: "去付款", variant: "default" },
        { key: "cancel", label: "取消订单" },
    ],
    pending_shipment: [{ key: "remind", label: "提醒发货" }],
    pending_receipt: [
        { key: "logistics", label: "查看物流" },
        { key: "confirm", label: "确认收货", variant: "default" },
    ],
    completed: [{ key: "rebuy", label: "再买一单" }],
    cancelled: [{ key: "rebuy", label: "再买一单" }],
}

/** 订单列表卡片：按状态给出该订单可执行的操作 */
export const ORDER_CARD_ACTIONS = BASE_ACTIONS

/** 订单详情页：与卡片同源，仅 completed 额外给「加入购物车」并把「再买一单」升为主操作 */
export const ORDER_DETAIL_ACTIONS: Record<OrderStatus, OrderActionItem[]> = {
    ...BASE_ACTIONS,
    completed: [
        { key: "rebuy", label: "再买一单", variant: "default" },
        { key: "add_cart", label: "加入购物车" },
    ],
}

/** 操作按钮排：进行中的动作对应按钮禁用，防重复提交 */
export function OrderActionButtons({
    actions,
    disabledKey,
    onAction,
}: {
    actions: OrderActionItem[]
    /** 进行中的操作 key */
    disabledKey?: OrderAction
    onAction?: (action: OrderAction) => void
}) {
    return (
        <>
            {actions.map((a) => (
                <Button
                    key={a.key}
                    variant={a.variant ?? "outline"}
                    size="sm"
                    className="min-w-24"
                    disabled={disabledKey === a.key}
                    onClick={() => onAction?.(a.key)}
                >
                    {a.label}
                </Button>
            ))}
        </>
    )
}
