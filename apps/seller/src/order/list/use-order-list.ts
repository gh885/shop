import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { OrderStatus } from "@shop/api/sdk"
import { SellerLogisticsApi, SellerOrdersApi } from "@shop/api/sdk"
import { notify } from "@shop/app-kit"

import { orderKeys, orderListOptions, type OrderListSearch } from "#/order/queries"
import { useCurrentShop } from "#/shop"

export type { OrderListSearch } from "#/order/queries"

/** 发货入参：物流公司 + 运单号（供发货弹窗提交） */
export type ShipInput = { logisticsCompany: string; trackingNo: string }

export function useOrderList(search: OrderListSearch) {
    const shop = useCurrentShop()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [busyId, setBusyId] = useState<string | undefined>()
    const shopId = shop?.id

    const orders = useQuery(orderListOptions(shopId, search))
    const records = orders.data?.records ?? []
    const total = orders.data?.total ?? 0

    // React Compiler 已接管缓存：回调不手动 memo，身份由编译器自动稳定
    function apply(next: Partial<OrderListSearch>) {
        void navigate({
            to: "/trade/order",
            search: {
                status: search.status,
                page: search.page,
                size: search.size,
                ...next,
                ...(next.status === undefined ? {} : { page: 1 }),
            },
        })
    }

    function invalidate() {
        return queryClient.invalidateQueries({ queryKey: orderKeys.lists(shopId) })
    }

    const ship = useMutation({
        // 发货端点已归物流模块（后端把发货当物流动作）：改用 SellerLogisticsApi；
        // 当前仍走老路径（自由文本物流公司），切到 POST /seller/shipments + 字典下拉是后续前端任务
        mutationFn: (args: ShipInput & { orderId: string }) =>
            SellerLogisticsApi.shipOrder({
                path: { id: args.orderId },
                body: { logisticsCompany: args.logisticsCompany, trackingNo: args.trackingNo },
            }),
        onSuccess: () => {
            notify.success("已发货")
            return invalidate()
        },
        onError: (err) => notify.fromError(err, "发货失败"),
    })

    const agreeAfterSale = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.agreeAfterSale({ path: { id } }),
        onSuccess: () => {
            notify.success("已同意售后")
            return invalidate()
        },
        onError: (err) => notify.fromError(err, "操作失败"),
    })

    const rejectAfterSale = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.rejectAfterSale({ path: { id } }),
        onSuccess: () => {
            notify.success("已拒绝售后")
            return invalidate()
        },
        onError: (err) => notify.fromError(err, "操作失败"),
    })

    const receiveReturn = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.receiveReturn({ path: { id } }),
        onSuccess: () => {
            notify.success("已确认收货并退款")
            return invalidate()
        },
        onError: (err) => notify.fromError(err, "操作失败"),
    })

    // 行级动作包装：记录 busyId + 吞掉 unhandled rejection（错误已 toast）
    const withBusy = (fn: (id: string) => Promise<unknown>) => (id: string) => {
        setBusyId(id)
        fn(id)
            .catch(() => undefined)
            .finally(() => setBusyId(undefined))
    }

    return {
        shop,
        orders,
        records,
        total,
        busyId,
        handleFilterChange: (status?: OrderStatus) => apply({ status, page: 1 }),
        onPageChange: (page: number) => apply({ page }),
        ship: (orderId: string, input: ShipInput) =>
            withBusy((id) => ship.mutateAsync({ orderId: id, ...input }))(orderId),
        agreeAfterSale: withBusy(agreeAfterSale.mutateAsync),
        rejectAfterSale: withBusy(rejectAfterSale.mutateAsync),
        receiveReturn: withBusy(receiveReturn.mutateAsync),
    }
}
