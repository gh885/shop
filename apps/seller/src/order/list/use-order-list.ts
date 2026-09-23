import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
        mutationFn: (args: { id: string; reason: string }) =>
            SellerOrdersApi.rejectAfterSale({
                path: { id: args.id },
                body: { reason: args.reason },
            }),
        meta: { success: "已拒绝售后", invalidates: afterSaleInvalidates },
    })

    const receiveReturn = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.receiveReturn({ path: { id } }),
        meta: { success: "已确认收货并退款", invalidates: afterSaleInvalidates },
    })

    // 收件人电话：列表出参只有掩码，明文逐单索取（ORD-62）。取到就写回这一行，不另立一份状态——
    // 列表缓存是这一屏数据的唯一真相；下次重新拉取自然又变回掩码，明文不长期驻留。
    // 故意不失效列表：失效会立刻把刚拿到的明文冲掉
    const revealPhone = useMutation({
        mutationFn: (id: string) => SellerOrdersApi.revealReceiverPhone({ path: { id } }),
        meta: { error: "查看买家电话失败" },
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
        // 拒绝要带上弹窗填的理由（必填，落点售后时间线）：包一层把 reason 折进行 id
        rejectAfterSale: (orderId: string, reason: string) =>
            run((id) => rejectAfterSale.mutateAsync({ id, reason }))(orderId),
        receiveReturn: run(receiveReturn.mutateAsync),
        /** 取这一行买家的电话明文（一次一单，后端留痕） */
        revealPhone: (orderId: string) => revealPhone.mutate(orderId),
        /** 正在索取明文的订单：那一行的入口要禁掉，每次索取都留下一条取用记录 */
        revealPhoneFor: revealPhone.isPending ? revealPhone.variables : undefined,
    }
}
