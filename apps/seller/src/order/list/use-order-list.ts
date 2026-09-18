import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { OrderStatus } from "@shop/api/sdk"
import { SellerLogisticsApi, SellerOrdersApi } from "@shop/api/sdk"

import { useWriteMutation } from "@shop/app-kit"

import { orderKeys, orderListOptions, type OrderListSearch } from "#/order/queries"
import { useRowBusy } from "#/shared/lib/use-row-busy"

export type { OrderListSearch } from "#/order/queries"

/** 发货入参：承运商字典 code + 运单号（供发货弹窗提交）。物流公司名由后端按 code 查字典归一，前端不传 */
export type ShipInput = { carrierCode: string; trackingNo: string }

/** 订单列表视图模型：shopId 由路由守卫（ShopGate）保证必有，页面经 useShop() 取到后传入 */
export function useOrderList(shopId: string, search: OrderListSearch) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { busyId, run } = useRowBusy()

    const orders = useQuery(orderListOptions(shopId, search))

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

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: orderKeys.lists(shopId) })
    }

    // 发货入口归 logistics 模块（后端把发货当物流动作）：承运商走字典 code，后端据此归一展示名
    const ship = useWriteMutation<ShipInput & { orderId: string }>({
        mutationFn: (args) =>
            SellerLogisticsApi.createShipment({
                body: {
                    orderId: args.orderId,
                    carrierCode: args.carrierCode,
                    trackingNo: args.trackingNo,
                },
            }),
        invalidate,
        messages: { success: "已发货", error: "发货失败" },
    })

    const agreeAfterSale = useWriteMutation<string>({
        mutationFn: (id) => SellerOrdersApi.agreeAfterSale({ path: { id } }),
        invalidate,
        messages: { success: "已同意售后" },
    })

    const rejectAfterSale = useWriteMutation<string>({
        mutationFn: (id) => SellerOrdersApi.rejectAfterSale({ path: { id } }),
        invalidate,
        messages: { success: "已拒绝售后" },
    })

    const receiveReturn = useWriteMutation<string>({
        mutationFn: (id) => SellerOrdersApi.receiveReturn({ path: { id } }),
        invalidate,
        messages: { success: "已确认收货并退款" },
    })

    return {
        orders,
        records: orders.data?.records ?? [],
        total: orders.data?.total ?? 0,
        busyId,
        handleFilterChange: (status?: OrderStatus) => apply({ status, page: 1 }),
        onPageChange: (page: number) => apply({ page }),
        // 发货要带上弹窗填的物流信息：包一层把 ShipInput 折进行 id
        ship: (orderId: string, input: ShipInput) =>
            run((id) => ship.mutateAsync({ orderId: id, ...input }))(orderId),
        agreeAfterSale: run(agreeAfterSale.mutateAsync),
        rejectAfterSale: run(rejectAfterSale.mutateAsync),
        receiveReturn: run(receiveReturn.mutateAsync),
    }
}
