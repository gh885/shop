import { message } from "#/locales/message"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { OrderStatus } from "@shop/api/sdk"
import { SellerLogisticsApi, SellerOrdersApi } from "@shop/api/sdk"
import { useOutOfRangePageGuard } from "@shop/app-kit/data"

import {
    afterSaleActionKeys,
    afterSaleListKeys,
    orderKeys,
    orderAfterSaleActionsOptions,
    orderListOptions,
} from "#/domains/order/queries"
import type { OrderListSearch } from "#/domains/order/search"
import { useRefundActions } from "#/domains/order/refund/use-refund-actions"
import { useRowBusy } from "#/shared/lib/use-row-busy"
import type { ShipInput } from "./ship-form"

export type { OrderListSearch } from "#/domains/order/search"

// 售后动作集由后端按本页订单批查下发：前端不按订单售后投影自推按钮表（两处各推必漂移）
function useAfterSaleActionsOf(shopId: string, rowIds: string[]) {
    const actions = useQuery(orderAfterSaleActionsOptions(shopId, rowIds))
    const byOrder = new Map((actions.data ?? []).map((a) => [a.orderId, a.availableActions]))
    return (orderId: string) => byOrder.get(orderId) ?? []
}

export function useOrderList(shopId: string, search: OrderListSearch) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { busyId, run } = useRowBusy()

    const orders = useQuery(orderListOptions(shopId, search))

    // React Compiler 已接管缓存：回调不手动 memo，身份由编译器自动稳定
    function apply(next: Partial<OrderListSearch>, replace = false) {
        void navigate({
            to: "/trade/order",
            search: {
                status: search.status,
                page: search.page,
                size: search.size,
                ...next,
                // 换状态页签回到第 1 页：留在第 3 页看新页签是空列表，看着像「没有数据」
                ...(next.status === undefined ? {} : { page: 1 }),
            },
            replace,
        })
    }

    // 越界页码收口：动作让订单流转出当前页签、列表收缩，数据落定后才判，修正用 replace 不留历史
    useOutOfRangePageGuard({
        page: search.page,
        total: orders.data?.total,
        size: search.size,
        onFix: (page) => apply({ page }, true),
    })

    const invalidates = [orderKeys.lists(shopId)]
    // 售后动作还会改「这行能给哪些按钮」与工作台待办：状态是同一份真相，不一起失效就是旧视图
    const afterSaleInvalidates = [
        ...invalidates,
        afterSaleActionKeys.lists(shopId),
        afterSaleListKeys.lists(shopId),
    ]

    // 发货归 logistics 模块（后端把发货当物流动作）：承运商走字典 code
    //
    // 后端是「录单 → 交寄」两步（打单与交给快递不是同一刻），卖家端一次点完：先录单再立即交寄。
    // 交寄失败时包裹会停在待发货，而 UI 没有交寄/取消入口——错误原样抛出，弹窗按 409 的结构化
    // params（shipmentId/carrierName/trackingNo）切出恢复横幅；下面两个 mutation 是横幅的动作。
    const ship = useMutation({
        mutationFn: async (args: ShipInput & { orderId: string }) => {
            const created = await SellerLogisticsApi.createShipment({
                body: {
                    orderId: args.orderId,
                    carrierCode: args.carrierCode,
                    trackingNo: args.trackingNo,
                    lines: args.lines,
                },
            })
            await SellerLogisticsApi.dispatchShipment({ path: { id: created.id } })
            return created
        },
        meta: {
            success: message("order.toast.shipped"),
            error: message("order.toast.shipFailed"),
            invalidates,
        },
    })

    // 恢复动作：把弹窗里那张「待交寄」的发货单交寄出去，或取消它（取消后卖家按当前表单重新提交）
    const dispatchDraft = useMutation({
        mutationFn: (shipmentId: string) =>
            SellerLogisticsApi.dispatchShipment({ path: { id: shipmentId } }),
        meta: {
            success: message("order.toast.draftDispatched"),
            error: message("order.toast.shipFailed"),
            invalidates,
        },
    })

    const cancelDraft = useMutation({
        mutationFn: (shipmentId: string) =>
            SellerLogisticsApi.cancelShipment({ path: { id: shipmentId } }),
        meta: {
            success: message("order.toast.draftCancelled"),
            error: message("order.toast.shipFailed"),
            invalidates,
        },
    })

    // 五个退款决定与退款工作台共用一份 mutation（同一批端点、同一套失效口径）
    const refundActions = useRefundActions(afterSaleInvalidates)

    // 明文写回这一行、故意不失效列表（失效会重拉，立刻用掩码把刚拿到的明文冲掉）
    const revealPhone = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.revealReceiverPhone({ path: { id } }),
        meta: { error: message("order.toast.buyerPhone.failed") },
        onSuccess: (res, id) =>
            queryClient.setQueryData<NonNullable<typeof orders.data>>(
                orderKeys.list(shopId, search),
                (prev) =>
                    prev
                        ? {
                              ...prev,
                              records: prev.records.map((r) =>
                                  r.id === id ? { ...r, receiverPhone: res.phone } : r,
                              ),
                          }
                        : prev,
            ),
    })

    const rowIds = (orders.data?.records ?? []).map((r) => r.id)
    const afterSaleActionsOf = useAfterSaleActionsOf(shopId, rowIds)

    return {
        orders,
        records: orders.data?.records ?? [],
        total: orders.data?.total ?? 0,
        busyId,
        afterSaleActionsOf,
        handleFilterChange: (status?: OrderStatus) => apply({ status, page: 1 }),
        onPageChange: (page: number) => apply({ page }),
        ship: (orderId: string, input: ShipInput) =>
            run((id) => ship.mutateAsync({ orderId: id, ...input }))(orderId),
        resolveShipDraft: (action: "dispatch" | "cancel", shipmentId: string) =>
            action === "dispatch"
                ? dispatchDraft.mutateAsync(shipmentId)
                : cancelDraft.mutateAsync(shipmentId),
        agreeAfterSale: run((id: string) =>
            refundActions.agree.mutateAsync({ refundId: id, orderId: id }),
        ),
        rejectAfterSale: (orderId: string, reason: string) =>
            run((id: string) =>
                refundActions.reject.mutateAsync({ refundId: id, orderId: id, reason }),
            )(orderId),
        receiveReturn: run((id: string) =>
            refundActions.receive.mutateAsync({ refundId: id, orderId: id }),
        ),
        interceptReturn: run((id: string) =>
            refundActions.intercept.mutateAsync({ refundId: id, orderId: id }),
        ),
        retryRefund: run((id: string) =>
            refundActions.retry.mutateAsync({ refundId: id, orderId: id }),
        ),
        revealPhone: (orderId: string) => revealPhone.mutate(orderId),
        revealPhoneFor: revealPhone.isPending ? revealPhone.variables : undefined,
    }
}
