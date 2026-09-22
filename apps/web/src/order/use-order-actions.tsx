import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { notify } from "@shop/app-kit"

import { CancelOrderDialog } from "./CancelOrderDialog"
import type { Order, OrderAction } from "./model"
import { useCancelOrder, useReceiveOrder } from "./queries"

/**
 * 订单操作分发（我的订单列表 / 订单详情共用）：
 * pay → 收银台；cancel → 取消原因弹窗（快捷原因 + 备注，确认后带 reason 发请求）；
 * confirm → 确认收货；logistics → 物流详情页；其余 toast 占位。一并给出按钮 pending 态（cancel/confirm 进行中）。
 * 弹窗状态由本 hook 持有（两处入口共用一份），调用方解构 cancelDialog 渲染即可，handleAction 只负责开。
 */
export function useOrderActions() {
    const navigate = useNavigate()
    const cancel = useCancelOrder()
    const receive = useReceiveOrder()
    // 取消目标单：未设置 = 弹窗关闭。整单进 state 是为了弹窗里能展示单号
    const [cancelTarget, setCancelTarget] = useState<Order>()

    const handleAction = (order: Order, action: OrderAction) => {
        switch (action) {
            case "pay":
                void navigate({ to: "/pay/$orderId", params: { orderId: order.id } })
                break
            case "cancel":
                setCancelTarget(order)
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

    const cancelDialog = (
        <CancelOrderDialog
            order={cancelTarget}
            onOpenChange={(open) => {
                if (!open) setCancelTarget(undefined)
            }}
            pending={cancel.isPending}
            onConfirm={(reason) =>
                cancelTarget &&
                cancel.mutate(
                    { orderId: cancelTarget.id, reason },
                    { onSuccess: () => setCancelTarget(undefined) },
                )
            }
        />
    )

    /** 进行中的操作 key：对应按钮禁用，防重复提交 */
    const pendingAction: OrderAction | undefined = cancel.isPending
        ? "cancel"
        : receive.isPending
          ? "confirm"
          : undefined

    return { handleAction, pendingAction, cancelDialog }
}
