import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { OrderStatus } from "@shop/api/sdk"
import { SellerLogisticsApi, SellerOrdersApi } from "@shop/api/sdk"

import {
    afterSaleActionKeys,
    afterSaleListKeys,
    orderKeys,
    orderAfterSaleActionsOptions,
    orderListOptions,
    type OrderListSearch,
} from "#/order/queries"
import { useRowBusy } from "#/shared/lib/use-row-busy"

export type { OrderListSearch } from "#/order/queries"

/** 发货入参：承运商字典 code + 运单号（供发货弹窗提交）。物流公司名由后端按 code 查字典归一，前端不传 */
export type ShipInput = { carrierCode: string; trackingNo: string }

/** 订单列表视图模型：shopId 由路由守卫（ShopGate）保证必有，页面经 useShop() 取到后传入 */
export function useOrderList(shopId: string, search: OrderListSearch) {
    const navigate = useNavigate()
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

    // 四个动作共用失效范围：本店订单列表（前缀，一发命中所有页签/分页）
    const invalidates = [orderKeys.lists(shopId)]
    // 售后三动作还会改变「这一行能给哪些按钮」与工作台的待办列表：状态是同一份真相，
    // 不一起失效就会出现徽章已翻篇、按钮还在的旧视图
    const afterSaleInvalidates = [
        ...invalidates,
        afterSaleActionKeys.lists(shopId),
        afterSaleListKeys.lists(shopId),
    ]

    // 发货入口归 logistics 模块（后端把发货当物流动作）：承运商走字典 code，后端据此归一展示名
    const ship = useMutation({
        mutationFn: (args: ShipInput & { orderId: string }) =>
            SellerLogisticsApi.createShipment({
                body: {
                    orderId: args.orderId,
                    carrierCode: args.carrierCode,
                    trackingNo: args.trackingNo,
                },
            }),
        meta: { success: "已发货", error: "发货失败", invalidates },
    })

    const agreeAfterSale = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.agreeAfterSale({ path: { id } }),
        meta: { success: "已同意售后", invalidates: afterSaleInvalidates },
    })

    const rejectAfterSale = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.rejectAfterSale({ path: { id } }),
        meta: { success: "已拒绝售后", invalidates: afterSaleInvalidates },
    })

    const receiveReturn = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.receiveReturn({ path: { id } }),
        meta: { success: "已确认收货并退款", invalidates: afterSaleInvalidates },
    })

    // 行内售后按钮的动作集由 aftersale 按本页订单批查下发（与工作台同一份契约），
    // 不按订单上的售后投影推：两处推一张按钮表必然漂移
    const rowIds = (orders.data?.records ?? []).map((r) => r.id)
    const afterSaleActions = useQuery(orderAfterSaleActionsOptions(shopId, rowIds))
    const actionsByOrder = new Map(
        (afterSaleActions.data ?? []).map((a) => [a.orderId, a.availableActions]),
    )

    return {
        orders,
        records: orders.data?.records ?? [],
        total: orders.data?.total ?? 0,
        busyId,
        /** 一行订单此刻可做的售后动作（无进行中的售后单 / 批查失败 → 空集，不给按钮） */
        afterSaleActionsOf: (orderId: string) => actionsByOrder.get(orderId) ?? [],
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
