import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { notify } from "@shop/app-kit/data"
import { confirm } from "@shop/ui-web"

import { CancelOrderDialog } from "./CancelOrderDialog"
import type { OrderAction } from "./model"
import { useCancelOrder, useExtendReceive, useReceiveOrder } from "./queries"

/**
 * 动作的作用对象：子订单 id 决定取消 / 收货打哪张单，主订单 id 决定去哪个收银台。
 * 卡片的店铺段与详情页都给得出这三样，所以调用处不必关心自己是哪一层。
 */
export type OrderActionTarget = {
    id: string
    orderNo: string
    tradeId: string
}

export function useOrderActions() {
    const navigate = useNavigate()
    const t = useT()
    const cancel = useCancelOrder()
    const receive = useReceiveOrder()
    const extend = useExtendReceive()
    const [cancelTarget, setCancelTarget] = useState<{ id: string; orderNo: string }>()

    const handleAction = (order: OrderActionTarget, action: OrderAction) => {
        switch (action) {
            case "pay":
                // 付款是主订单的动作：收银台按主订单 id 进，一次付清这次结算的全部子订单
                void navigate({ to: "/pay/$tradeId", params: { tradeId: order.tradeId } })
                break
            case "cancel":
                setCancelTarget({ id: order.id, orderNo: order.orderNo })
                break
            case "confirm":
                receive.mutate(order.id)
                break
            case "extend_receive":
                void confirm({
                    title: t("order.extend.title"),
                    description: t("order.extend.description"),
                    confirmText: t("order.extend.confirmText"),
                    action: () => extend.mutateAsync(order.id),
                })
                break
            case "logistics":
                void navigate({ to: "/logistics/$orderId", params: { orderId: order.id } })
                break
            default:
                notify.info(message("order.soon.action", { action }))
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
                await cancel.mutateAsync({ orderId: cancelTarget.id, reason })
                setCancelTarget(undefined)
            }}
        />
    )

    const pendingAction: OrderAction | undefined = extend.isPending
        ? "extend_receive"
        : cancel.isPending
          ? "cancel"
          : receive.isPending
            ? "confirm"
            : undefined

    return { handleAction, pendingAction, cancelDialog }
}
