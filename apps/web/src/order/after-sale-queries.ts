import { OrdersApi, type TicketResponse, type TicketType } from "@shop/api/sdk"
import { useWriteMutation } from "@shop/app-kit"
import { toApiError } from "@shop/common"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"

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

/** 导出供 route loader 客户端预热（订单详情页 loader 一并预取售后单） */
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
    })

/** 某订单最近一张售后单（含终态）；从未申请过返回 null */
export function useAfterSale(orderId: string) {
    return useQuery(afterSaleOptions(orderId))
}

// ---------- 写操作（申请 / 撤销 / 回寄），纯 fetch 便于断言投影 ----------

/** 申请售后：type 必填，理由空串按「没填」处理（后端 reason 可空，别把空白当理由存下来） */
async function applyAfterSale(
    orderId: string,
    input: { type: TicketType; reason?: string },
): Promise<void> {
    const reason = input.reason?.trim()
    await OrdersApi.applyAfterSale({
        path: { id: orderId },
        body: { type: input.type, reason: reason || undefined },
    })
}

/** 撤销售后申请（仅待卖家处理可撤销） */
export function useCancelAfterSale(orderId: string) {
    return useAfterSaleMutation(() => OrdersApi.cancelAfterSale({ path: { id: orderId } }), {
        success: "已撤销申请",
        error: "撤销失败",
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
/** 三个写操作共用：成功提示 + 失效售后单/订单详情/订单列表 */
function useAfterSaleMutation<TInput>(
    mutationFn: (input: TInput) => Promise<unknown>,
    messages: { success: string; error: string },
) {
    const qc = useQueryClient()
    return useWriteMutation<TInput>({
        mutationFn,
        invalidate: () => {
            void qc.invalidateQueries({ queryKey: AFTER_SALE_KEY })
            void qc.invalidateQueries({ queryKey: ORDER_DETAIL_KEY })
            void qc.invalidateQueries({ queryKey: MY_ORDERS_KEY })
        },
        messages,
    })
}

/** 申请售后 */
export function useApplyAfterSale(orderId: string) {
    return useAfterSaleMutation(
        (input: { type: TicketType; reason?: string }) => applyAfterSale(orderId, input),
        { success: "售后申请已提交，等待卖家处理", error: "申请售后失败" },
    )
}

/** 回寄退货填单 */
export function useReturnAfterSale(orderId: string) {
    return useAfterSaleMutation(
        (input: { logisticsCompany: string; trackingNo: string }) =>
            returnAfterSale(orderId, input),
        { success: "退货物流已提交", error: "提交退货物流失败" },
    )
}
