import { OrdersApi, PaymentsApi } from "@shop/api/sdk"
import type { PreviewResponse } from "@shop/api/sdk"

import { statusToWire, toOrder, toOrderDetail } from "./order"
import type { Order, OrderDetail, OrderStatus } from "./model"
import { queryOptions, useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { notify } from "@shop/app-kit"

/**
 * order/queries —— 订单的数据层（fetch 纯函数 + queryOptions + hooks）。
 * 规则/类型在 ./order.ts（投影）与 ./model.ts（领域类型）。
 *
 * 订单页是受保护路由（_protected layout 保证挂载时必已登录），所以：
 * - 列表/详情的 queryOptions 都**不进 route loader**（SSR 阶段服务端拿不到 token），
 *   由组件侧 useSuspenseQuery / useQuery 在客户端拉取——与项目「受保护页数据客户端取」的结论一致。
 * - 结算预览/下单/支付是交互动作，不设缓存，走 mutation。
 */

// ---------- 我的订单列表 ----------

/** 列表失效 key：前缀部分匹配，一发命中所有 tab/分页（checkout 等跨模块失效也引用它） */
export const MY_ORDERS_KEY = ["my-orders"] as const

/** 详情 key 前缀：精确 key 为 [ORDER_DETAIL_KEY, id]，失效用前缀一发命中 */
export const ORDER_DETAIL_KEY = ["order-detail"] as const

/** 仅客户端拉取（受保护页），queryKey 带 status/page/size 便于按 tab 缓存分片 */
const myOrdersOptions = ({
    status,
    page = 1,
    size = 20,
}: { status?: OrderStatus | "all"; page?: number; size?: number } = {}) => {
    const wire = {
        query: {
            pageParams: { page, size },
            query: {
                status: status && status !== "all" ? statusToWire(status) : undefined,
            },
        },
    } as const
    return queryOptions({
        queryKey: [...MY_ORDERS_KEY, status ?? "all", page, size],
        queryFn: async ({ signal }): Promise<{ records: Order[]; total: number }> => {
            const result = await OrdersApi.listMyOrders({ ...wire, signal })
            return {
                records: result.records.map(toOrder),
                total: result.total,
            }
        },
        staleTime: 30_000,
        // 切 Tab/翻页时保留上一份数据展示（isPlaceholderData），不重放 Skeleton
        placeholderData: (prev) => prev,
    })
}

/** 我的订单列表（当前 tab） */
export function useMyOrders(status: OrderStatus | "all" = "all") {
    return useQuery(myOrdersOptions({ status }))
}

// ---------- 订单详情 ----------

const orderDetailOptions = (id: string) =>
    queryOptions({
        queryKey: [...ORDER_DETAIL_KEY, id],
        queryFn: async ({ signal }): Promise<OrderDetail> =>
            toOrderDetail(await OrdersApi.getOrderDetail({ path: { id }, signal })),
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
    return await OrdersApi.previewOrder({
        body: {
            cartItemIds: args.cartItemIds,
            buySkuId: args.buySkuId,
            buyQuantity: args.buyQuantity,
            addressId: args.addressId,
        },
    })
}

/** 创建订单：按店拆单，返回全部新单 */
export async function createOrder(args: {
    addressId: string
    cartItemIds?: string[]
    buySkuId?: string
    buyQuantity?: number
    buyerMessage?: string
}) {
    return await OrdersApi.createOrder({ body: args })
}

/** 发起支付：V1 创建 PENDING 流水（不动订单状态），返回待确认流水 */
export async function createPayment(orderId: string) {
    return await PaymentsApi.createPayment({ body: { orderId } })
}

/** 确认支付：模拟网关回调，PENDING → SUCCESS + 推进订单；返回成功流水 */
export async function confirmPayment(paymentId: string) {
    return await PaymentsApi.confirmPayment({ path: { id: paymentId } })
}

/** 取消订单 */
async function cancelOrder(orderId: string) {
    return await OrdersApi.cancelOrder({ path: { id: orderId }, body: { reason: "用户取消" } })
}

/** 确认收货 */
async function receiveOrder(orderId: string) {
    return await OrdersApi.receiveOrder({ path: { id: orderId } })
}

// ---------- 订单操作 mutation（取消/确认收货共用一套失效 + 提示接线） ----------

/** 订单动作 mutation 工厂：成功 toast + 失效订单列表与该单详情，错误统一文案 */
function useOrderActionMutation(
    mutationFn: (orderId: string) => Promise<unknown>,
    messages: { success: string; error: string },
) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn,
        onSuccess: (_data, orderId) => {
            notify.success(messages.success)
            void qc.invalidateQueries({ queryKey: MY_ORDERS_KEY })
            void qc.invalidateQueries({ queryKey: [...ORDER_DETAIL_KEY, orderId] })
        },
        onError: (err) => notify.fromError(err, messages.error),
    })
}

/** 取消订单：仅待付款/待发货可取消，成功后失效订单列表 + 详情缓存 */
export function useCancelOrder() {
    return useOrderActionMutation(cancelOrder, { success: "订单已取消", error: "取消订单失败" })
}

/** 确认收货：已发货 → 已完成 */
export function useReceiveOrder() {
    return useOrderActionMutation(receiveOrder, { success: "确认收货成功", error: "确认收货失败" })
}
