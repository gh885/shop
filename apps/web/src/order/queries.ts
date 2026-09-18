import { OrdersApi } from "@shop/api/sdk"
import type { PreviewResponse } from "@shop/api/sdk"

import { statusToWire, toOrder, toOrderDetail } from "./order"
import type { Order, OrderDetail, OrderStatus } from "./model"
import { queryOptions } from "@tanstack/react-query"

import { useWriteMutation } from "@shop/app-kit"

/**
 * order/queries —— 订单的数据层（fetch 纯函数 + queryOptions + hooks）。
 * 规则/类型在 ./order.ts（投影）与 ./model.ts（领域类型）。
 *
 * 订单页是受保护路由（_protected layout 保证挂载时必已登录），所以：
 * - 列表/详情的 queryOptions 供 route loader **客户端预热**用：SSR 阶段服务端拿不到 token，
 *   loader 在服务端直接跳过，数据仍由组件侧 useQuery 在客户端拉取；预热让 hover intent /
 *   客户端导航先拉好缓存，组件挂载即命中，不再闪骨架（query() 失败会被吞掉，错误仍由组件就地错误态处理）。
 * - 结算预览/下单/支付是交互动作，不设缓存，走 mutation。
 */

// ---------- 我的订单列表 ----------

/** 列表失效 key：前缀部分匹配，一发命中所有 tab/分页（checkout 等跨模块失效也引用它） */
export const MY_ORDERS_KEY = ["my-orders"] as const

/** 详情 key 前缀：精确 key 为 [ORDER_DETAIL_KEY, id]，失效用前缀一发命中 */
export const ORDER_DETAIL_KEY = ["order-detail"] as const

/** 仅客户端拉取（受保护页），queryKey 带 status/page/size 便于按 tab 缓存分片；
 *  导出供 route loader 客户端预热（account/orders 页 loader 预取默认 tab 第一页），
 *  组件侧直接 `useQuery(myOrdersOptions({ status, page }))` —— 不为它再包一层同名 hook。 */
export const myOrdersOptions = ({
    status,
    page = 1,
    size = 20,
}: { status?: OrderStatus | "all"; page?: number; size?: number } = {}) => {
    // 变量一律在 queryFn 内部构造：外面留一个 `wire` 会被 tanstack-query/exhaustive-deps
    // 判成「闭包变量没进 queryKey」——它的实际输入（status/page/size）三者都已入 key，
    // 但这个单态对象本身不是缓存维度，写在外面只是给规则制造假阳性。
    return queryOptions({
        queryKey: [...MY_ORDERS_KEY, status ?? "all", page, size],
        queryFn: async ({ signal }): Promise<{ records: Order[]; total: number }> => {
            const wire = {
                query: {
                    pageParams: { page, size },
                    query: {
                        status: status && status !== "all" ? statusToWire(status) : undefined,
                    },
                },
            } as const
            const result = await OrdersApi.listMyOrders({ ...wire, signal })
            return {
                records: result.records.map(toOrder),
                total: result.total,
            }
        },
        staleTime: 30_000,
        // 切 Tab/翻页时保留上一份数据展示（isPlaceholderData），不重放 Skeleton
        placeholderData: (prev) => prev,
        // 列表带 placeholderData（不能走 suspense），失败交给路由错误页——全局默认 throwOnError 已按
        // 「一条数据都没有才抛」判据工作：切页签失败不会把上一页内容也换掉
    })
}

// ---------- 订单详情 ----------

/** 导出供 route loader 客户端预热（订单详情/物流页 loader 预取）；组件直接 useQuery(orderDetailOptions(id)) */
export const orderDetailOptions = (id: string) =>
    queryOptions({
        queryKey: [...ORDER_DETAIL_KEY, id],
        queryFn: async ({ signal }): Promise<OrderDetail> =>
            toOrderDetail(await OrdersApi.getOrderDetail({ path: { id }, signal })),
        staleTime: 30_000,
        retry: false,
    })

// ---------- 结算预览 / 下单 / 支付（交互动作，mutation 由调用方 useMutation 接线） ----------

/** 结算预览：只读幂等，返回分组明细/失效行/地址/应付总额的 wire 形状（页面再投影）。
 *  `userCouponIds` 为每店选中的券（后端按店核销，至多一张）；不传 = 不用券。 */
export async function fetchPreview(args: {
    lines: { skuId: string; quantity: number }[]
    addressId?: string
    userCouponIds?: string[]
}): Promise<PreviewResponse> {
    return await OrdersApi.previewOrder({
        body: {
            lines: args.lines,
            addressId: args.addressId,
            userCouponIds: args.userCouponIds?.length ? args.userCouponIds : undefined,
        },
    })
}

/** 创建订单：按店拆单，返回全部新单。checkoutKey 为一次结算的幂等键，重试带同一个值即回放原单。
 *  选中的券一并落单（选了却不可用的券后端 400 拒绝，故调用方只传可用券）。 */
export async function createOrder(args: {
    checkoutKey: string
    addressId: string
    lines: { skuId: string; quantity: number }[]
    userCouponIds?: string[]
    buyerMessage?: string
}) {
    return await OrdersApi.createOrder({
        body: {
            ...args,
            userCouponIds: args.userCouponIds?.length ? args.userCouponIds : undefined,
        },
    })
}

/** 确认支付：模拟网关回调，PENDING → SUCCESS + 推进订单；返回成功流水 */
// 发起支付/确认支付直接在 checkout 的 mutation 里调 SDK（两段式流水消费方各自接线）

// ---------- 订单操作 mutation（取消/确认收货共用一套失效 + 提示接线） ----------

/** 订单动作 mutation 工厂：成功 toast + 失效订单列表与该单详情，错误统一文案 */
function useOrderActionMutation(
    mutationFn: (orderId: string) => Promise<unknown>,
    messages: { success: string; error: string },
) {
    return useWriteMutation<string>({
        mutationFn,
        invalidateKeys: (_data, orderId) => [MY_ORDERS_KEY, [...ORDER_DETAIL_KEY, orderId]],
        messages,
    })
}

/** 取消订单：仅待付款/待发货可取消，成功后失效订单列表 + 详情缓存 */
export function useCancelOrder() {
    return useOrderActionMutation(
        (orderId) => OrdersApi.cancelOrder({ path: { id: orderId }, body: { reason: "用户取消" } }),
        { success: "订单已取消", error: "取消订单失败" },
    )
}

/** 确认收货：已发货 → 已完成 */
export function useReceiveOrder() {
    return useOrderActionMutation((orderId) => OrdersApi.receiveOrder({ path: { id: orderId } }), {
        success: "确认收货成功",
        error: "确认收货失败",
    })
}
