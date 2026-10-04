import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { notify } from "@shop/app-kit/data"
import { confirm } from "@shop/ui-web"

import { CancelOrderDialog } from "./CancelOrderDialog"
import type { Order, OrderAction } from "./model"
import { useCancelOrder, useExtendReceive, useReceiveOrder } from "./queries"

/**
 * 订单操作分发（我的订单列表 / 订单详情共用）：
 * pay → 收银台；cancel → 取消原因弹窗；confirm → 确认收货；extend_receive → 延长收货二次确认；
 * logistics → 物流详情页；其余 toast 占位。一并给出按钮 pending 态（cancel/confirm/extend 进行中）。
 * 弹窗状态由本 hook 持有（两处入口共用一份），调用方解构 cancelDialog 渲染即可，handleAction 只负责开。
 */
export function useOrderActions() {
    const navigate = useNavigate()
    const cancel = useCancelOrder()
    const receive = useReceiveOrder()
    const extend = useExtendReceive()
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
            case "extend_receive":
                // 二次确认：它推后了「自动确认收货」这件事，额度只有 1 次，点错了就没了
                void confirm({
                    title: "延长确认收货",
                    description: "确认收货时间将延长 7 天（仅一次机会），期间不会自动确认收货。",
                    confirmText: "延长 7 天",
                    action: () => extend.mutateAsync(order.id),
                })
                break
            case "logistics":
                void navigate({ to: "/logistics/$orderId", params: { orderId: order.id } })
                break
            default:
                notify.info({ key: "web.order.soon.action", params: { action } })
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
            onConfirm={async (reason) => {
                if (!cancelTarget) return
                // mutateAsync（非 fire-and-forget）：把 rejection 交回弹窗的 onSubmit，
                // 那里才能接住后端 422 的字段级错误并标红原因框；成功后再关弹窗
                await cancel.mutateAsync({ orderId: cancelTarget.id, reason })
                setCancelTarget(undefined)
            }}
        />
    )

    /** 进行中的操作 key：对应按钮禁用，防重复提交 */
    const pendingAction: OrderAction | undefined = extend.isPending
        ? "extend_receive"
        : cancel.isPending
          ? "cancel"
          : receive.isPending
            ? "confirm"
            : undefined

    return { handleAction, pendingAction, cancelDialog }
}
