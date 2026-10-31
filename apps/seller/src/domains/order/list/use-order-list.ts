import { message } from "#/locales/message"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { SellerOrderControllerApi, SellerShipmentControllerApi } from "@shop/api/sdk"
import { useState } from "react"

import { orderKeys, orderDetailOptions, orderListOptions } from "#/domains/order/queries"
import type { OrderListSearch } from "#/domains/order/search"
import { useRowBusy } from "#/shared/lib/use-row-busy"
import type { ShipInput } from "./ship-form"
import type { OrderStatus } from "#/domains/order/constants"

export type { OrderListSearch } from "#/domains/order/search"

export function useOrderList(shopId: string, search: OrderListSearch) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { busyId, run } = useRowBusy()

    const orders = useQuery(orderListOptions(shopId, search))

    function apply(next: Partial<OrderListSearch>, replace = false) {
        void navigate({
            to: "/trade/order",
            search: {
                status: search.status,
                cursor: search.cursor,
                size: search.size,
                ...next,
                // 换状态页签回到第一页：拿着上一页游标去看新页签，游标指向的位置毫无意义
                ...(next.status === undefined ? {} : { cursor: undefined }),
            },
            replace,
        })
    }

    const invalidates = [orderKeys.lists(shopId)]

    // 发货：一次录单即交寄（后端 POST 直接落一个已交寄的包裹并扣减可发量）
    const ship = useMutation({
        mutationFn: (args: ShipInput & { orderId: string }) =>
            SellerShipmentControllerApi.ship({
                path: { sellerOrderId: args.orderId },
                body: {
                    carrierCode: args.carrierCode,
                    trackingNo: args.trackingNo,
                    items: args.items,
                },
            }),
        meta: {
            success: message("order.toast.shipped"),
            error: message("order.toast.shipFailed"),
            invalidates,
        },
    })

    // 明文写回这一行的本地表、故意不失效列表（失效会重拉，立刻用掩码把刚拿到的明文冲掉）
    const [phones, setPhones] = useState<Record<string, string>>({})
    const revealPhone = useMutation({
        mutationFn: (id: string) =>
            SellerOrderControllerApi.receiverPhone({ path: { sellerOrderId: id } }),
        meta: { error: message("order.toast.buyerPhone.failed") },
        onSuccess: (res, id) => setPhones((prev) => ({ ...prev, [id]: res.phone })),
    })

    return {
        orders,
        records: orders.data?.items ?? [],
        nextCursor: orders.data?.nextCursor ?? undefined,
        busyId,
        phones,
        handleFilterChange: (status?: OrderStatus) => apply({ status }),
        onLoadMore: () => apply({ cursor: orders.data?.nextCursor ?? undefined }),
        ship: (orderId: string, input: ShipInput) =>
            run((id) => ship.mutateAsync({ orderId: id, ...input }))(orderId),
        revealPhone: (orderId: string) => revealPhone.mutate(orderId),
        revealPhoneFor: revealPhone.isPending ? revealPhone.variables : undefined,
        detailOptions: orderDetailOptions,
        invalidate: () => queryClient.invalidateQueries({ queryKey: orderKeys.lists(shopId) }),
    }
}
