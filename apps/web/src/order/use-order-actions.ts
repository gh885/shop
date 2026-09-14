import { useNavigate } from "@tanstack/react-router"

import { notify } from "@shop/app-kit"

import type { Order, OrderAction } from "./model"
import { useCancelOrder, useReceiveOrder } from "./queries"

/**
 * 订单操作分发（我的订单列表 / 订单详情共用）：
 * pay → 收银台；cancel → 二次确认（弹窗由调用方持有，这里只回调请求）；
 * confirm → 确认收货；logistics → 物流详情页；其余 toast 占位。一并给出按钮 pending 态（cancel/confirm 进行中）。
 * 调用方还需要 cancel.mutate 去接确认弹窗，故一并返回。
 */
export function useOrderActions(onRequestCancel: (order: Order) => void) {
    const navigate = useNavigate()
    const cancel = useCancelOrder()
    const receive = useReceiveOrder()

    const handleAction = (order: Order, action: OrderAction) => {
        switch (action) {
            case "pay":
                void navigate({ to: "/pay/$orderId", params: { orderId: order.id } })
                break
            case "cancel":
                onRequestCancel(order)
                break
            case "confirm":
                receive.mutate(order.id)
                break
            case "logistics":
                void navigate({ to: "/logistics/$orderId", params: { orderId: order.id } })
                break
            default:
                notify.info(`「${action}」即将上线`)
                break
        }
    }

    /** 进行中的操作 key：对应按钮禁用，防重复提交 */
    const pendingAction: OrderAction | undefined = cancel.isPending
        ? "cancel"
        : receive.isPending
          ? "confirm"
          : undefined

    return { handleAction, pendingAction, cancel }
}
