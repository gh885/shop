import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query"
import { OrdersApi, PaymentsApi } from "@shop/api/sdk"
import type { PreviewResponse } from "@shop/api/sdk"

import { notify } from "#/shared/lib/toast"

import { toOrder, toOrderDetail } from "./order"
import type { Order, OrderDetail, OrderStatus } from "./model"

/**
 * use-order —— 订单的数据层（fetch 纯函数 + queryOptions + hooks）。
 * 规则/类型在 ./order.ts（投影）与 ./model.ts（领域类型）。
 *
 * 订单页是受保护路由（_protected layout 保证挂载时必已登录），所以：
 * - 列表/详情的 queryOptions 都**不进 route loader**（SSR 阶段服务端拿不到 token），
 *   由组件侧 useSuspenseQuery / useQuery 在客户端拉取——与项目「受保护页数据客户端取」的结论一致。
 * - 结算预览/下单/支付是交互动作，不设缓存，走 mutation。
 */

// ---------- 我的订单列表 ----------

export const MY_ORDERS_KEY = ["my-orders"] as const

/** 仅客户端拉取（受保护页），queryKey 带 status 便于按 tab 缓存分片 */
export const myOrdersOptions = ({
    status,
    page = 1,
    size = 20,
}: { status?: OrderStatus | "all"; page?: number; size?: number } = {}) =>
    queryOptions({
        queryKey: [...MY_ORDERS_KEY, status ?? "all", page, size],
        queryFn: async (): Promise<{ records: Order[]; total: number }> => {
            const res = await OrdersApi.listMyOrders({
                query: {
                    pageParams: { page, size },
                    query: { status: status === "all" ? undefined : status },
                },
            })
            if (res.error) throw res.error
            return {
                records: (res.data?.records ?? []).map(toOrder),
                total: res.data?.total ?? 0,
            }
        },
        staleTime: 30_000,
    })

/** 我的订单列表（当前 tab） */
export function useMyOrders(status: OrderStatus | "all" = "all") {
    return useQuery(myOrdersOptions({ status }))
}

// ---------- 订单详情 ----------

export const orderDetailOptions = (id: string) =>
    queryOptions({
        queryKey: ["order-detail", id],
        queryFn: async (): Promise<OrderDetail> => {
            const res = await OrdersApi.getOrderDetail({ path: { id } })
            if (res.error) throw res.error
            return toOrderDetail(res.data ?? {})
        },
        staleTime: 30_000,
        retry: false,
    })

export function useOrderDetail(id: string) {
    return useQuery(orderDetailOptions(id))
}

// ---------- 结算预览 / 下单 / 支付（交互动作，mutation 由调用方 useMutation 接线） ----------

/** 结算预览：只读幂等，返回分组明细/失效行/地址/应付总额的 wire 形状（页面再投影） */
export async function fetchPreview(args: {
    cartItemIds?: string[]
    buySkuId?: string
    buyQuantity?: number
    addressId?: string
}): Promise<PreviewResponse> {
    const res = await OrdersApi.previewOrder({
        body: {
            cartItemIds: args.cartItemIds,
            buySkuId: args.buySkuId,
            buyQuantity: args.buyQuantity,
            addressId: args.addressId,
        },
    })
    if (res.error) throw res.error
    return res.data ?? {}
}

/** 创建订单：按店拆单，返回全部新单 */
export async function createOrder(args: {
    addressId: string
    cartItemIds?: string[]
    buySkuId?: string
    buyQuantity?: number
    buyerMessage?: string
}) {
    const res = await OrdersApi.createOrder({ body: args })
    if (res.error) throw res.error
    return res.data ?? {}
}

/** 发起支付：V1 MOCK 即时成功，返回成功流水 */
export async function createPayment(orderId: string) {
    const res = await PaymentsApi.createPayment({ body: { orderId } })
    if (res.error) throw res.error
    return res.data ?? {}
}

/** 取消订单 */
export async function cancelOrder(orderId: string) {
    const res = await OrdersApi.cancelOrder({ path: { id: orderId }, body: { reason: "用户取消" } })
    if (res.error) throw res.error
    return res.data
}

/** 确认收货 */
export async function receiveOrder(orderId: string) {
    const res = await OrdersApi.receiveOrder({ path: { id: orderId } })
    if (res.error) throw res.error
    return res.data
}

// ---------- 订单操作 mutation（取消/确认收货/支付） ----------

/** 取消订单：仅待付款/待发货可取消，成功后失效订单列表 + 详情缓存 */
export function useCancelOrder() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (orderId: string) => cancelOrder(orderId),
        onMutate: () => notify.info("取消订单中…"),
        onSuccess: (_data, orderId) => {
            notify.success("订单已取消")
            qc.invalidateQueries({ queryKey: ["my-orders"] })
            qc.invalidateQueries({ queryKey: ["order-detail", orderId] })
        },
        onError: (err) => notify.fromError(err, "取消订单失败"),
    })
}

/** 确认收货：已发货 → 已完成 */
export function useReceiveOrder() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (orderId: string) => receiveOrder(orderId),
        onSuccess: (_data, orderId) => {
            notify.success("确认收货成功")
            qc.invalidateQueries({ queryKey: ["my-orders"] })
            qc.invalidateQueries({ queryKey: ["order-detail", orderId] })
        },
        onError: (err) => notify.fromError(err, "确认收货失败"),
    })
}
