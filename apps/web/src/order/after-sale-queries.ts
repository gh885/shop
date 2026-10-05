import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import {
    OrdersApi,
    type AfterSaleReason,
    type TicketResponse,
    type TicketType,
} from "@shop/api/sdk"

import { toApiError } from "@shop/common/contract"
import { MY_ORDERS_KEY, ORDER_DETAIL_KEY } from "./queries"

/**
 * after-sale 的数据层（fetch 纯函数 + queryOptions + hooks）。
 *
 * 两个约定：
 * - 售后单随订单详情一起看，所以「无售后记录」的 404 不是错误而是业务事实（返回 null），
 *   只有其它错误才抛出——与 logistics「未发货 404」同一套判据。
 * - 三个写操作共用一套失效：售后单自身 + 订单详情与列表（订单上的 afterSaleStatus 是投影列，
 *   写操作会让它变），少一个就会出现「售后卡更新了、订单状态徽章还是旧值」。
 */

/** 售后单缓存 key 前缀：精确 key 为 [AFTER_SALE_KEY, orderId] */
const AFTER_SALE_KEY = ["after-sale"] as const

/** 导出供 route loader 客户端预热（订单详情页 loader 一并预取售后单）；
 *  组件直接 `useQuery(afterSaleOptions(orderId))` —— 「从未申请过返回 null」这条语义在 options 里。 */
export const afterSaleOptions = (orderId: string) =>
    queryOptions({
        queryKey: [...AFTER_SALE_KEY, orderId],
        queryFn: async ({ signal }): Promise<TicketResponse | null> => {
            try {
                return await OrdersApi.getAfterSale({ path: { id: orderId }, signal })
            } catch (error) {
                // 从没申请过售后 → 404；这是「没有」而不是「失败」，不给它错误态
                if (toApiError(error).status === 404)
                    // oxlint-disable-next-line no-null -- TanStack Query 以 undefined 表示「仍在加载」，404 归零必须返回 null（显式「无数据」的成功载荷）
                    return null
                throw error
            }
        },
        staleTime: 30_000,
        retry: false,
        // 售后卡是订单详情的附属件（见页面注释：失败就不画卡，与「从未申请过」同一呈现）。
        // 退出全局的「失败抛给错误边界」：它头上没有 QueryBoundary，抛出去会把整张订单详情页换掉
        throwOnError: false,
    })

// 写操作（申请 / 撤销 / 回寄）：请求拼装留成纯函数便于断言投影，接线各自一个 useMutation
/** 申请售后：类型与原因必选（原因枚举是判定「七天无理由」的唯一依据），补充说明空串按「没填」处理 */
async function applyAfterSale(
    orderId: string,
    input: { type: TicketType; reasonCode: AfterSaleReason; reason?: string },
): Promise<void> {
    const reason = input.reason?.trim()
    await OrdersApi.applyAfterSale({
        path: { id: orderId },
        body: { type: input.type, reasonCode: input.reasonCode, reason: reason || undefined },
    })
}

/**
 * 回寄退货并填物流单（仅退货退款 · 待寄回可填）。
 * 不传 carrierCode：买家回寄是线下行为，他多半只知道「顺丰」这个名字，后端按名字匹配承运商字典。
 */
async function returnAfterSale(
    orderId: string,
    input: { logisticsCompany: string; trackingNo: string },
): Promise<void> {
    await OrdersApi.returnGoods({
        path: { id: orderId },
        body: {
            logisticsCompany: input.logisticsCompany.trim(),
            trackingNo: input.trackingNo.trim(),
        },
    })
}

/** 三个写操作改变了同一批缓存（见文件头）：抽成一个常量是为了加第四棵树时不漏一处 */
const AFTER_SALE_WRITE_INVALIDATES = [AFTER_SALE_KEY, ORDER_DETAIL_KEY, MY_ORDERS_KEY]

/** 申请售后 */
export function useApplyAfterSale(orderId: string) {
    return useMutation({
        mutationFn: (input: { type: TicketType; reasonCode: AfterSaleReason; reason?: string }) =>
            applyAfterSale(orderId, input),
        meta: {
            success: message("web.order.afterSale.toast.applied"),
            error: message("web.order.afterSale.toast.applyFailed"),
            invalidates: AFTER_SALE_WRITE_INVALIDATES,
        },
    })
}

/** 撤销售后申请（仅待卖家处理可撤销） */
export function useCancelAfterSale(orderId: string) {
    return useMutation({
        mutationFn: () => OrdersApi.cancelAfterSale({ path: { id: orderId } }),
        meta: {
            success: message("web.order.afterSale.toast.cancelled"),
            error: message("web.order.afterSale.toast.cancelFailed"),
            invalidates: AFTER_SALE_WRITE_INVALIDATES,
        },
    })
}

/** 回寄退货填单 */
export function useReturnAfterSale(orderId: string) {
    return useMutation({
        mutationFn: (input: { logisticsCompany: string; trackingNo: string }) =>
            returnAfterSale(orderId, input),
        meta: {
            success: message("web.order.afterSale.toast.returnSubmitted"),
            error: message("web.order.afterSale.toast.returnSubmitFailed"),
            invalidates: AFTER_SALE_WRITE_INVALIDATES,
        },
    })
}
