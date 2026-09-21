import { useNavigate } from "@tanstack/react-router"

import { notify } from "@shop/app-kit"
import { confirm } from "@shop/ui-web"

import type { Order, OrderAction } from "./model"
import { useCancelOrder, useReceiveOrder } from "./queries"

/**
 * 订单操作分发（我的订单列表 / 订单详情共用）：
 * pay → 收银台；cancel → 全局二次确认后取消；
 * confirm → 确认收货；logistics → 物流详情页；其余 toast 占位。一并给出按钮 pending 态（cancel/confirm 进行中）。
 * 二次确认在这里发起（两处入口文案一致，弹窗状态由全局 ConfirmDialogHost 持有），调用方只接线 handleAction。
 */
export function useOrderActions() {
    const navigate = useNavigate()
    const cancel = useCancelOrder()
    const receive = useReceiveOrder()

    const handleAction = (order: Order, action: OrderAction) => {
        switch (action) {
            case "pay":
                void navigate({ to: "/pay/$orderId", params: { orderId: order.id } })
                break
            case "cancel":
                void confirm({
                    title: "取消订单",
                    description: `确定取消订单 ${order.orderNo} 吗？该操作不可恢复。`,
                    confirmText: "取消订单",
                    action: () => cancel.mutateAsync(order.id),
                })
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

    return { handleAction, pendingAction }
}
