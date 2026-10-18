import { message } from "#/locales/message"
import { useMutation } from "@tanstack/react-query"
import { SellerOrdersApi } from "@shop/api/sdk"

/** 退款处理端点挂在订单资源下（/seller/orders/{id}/refunds），列表行是退款单：两个 id 都要 */
export interface RefundActionArgs {
    refundId: string
    orderId: string
}

/**
 * 卖家的五个退款决定：同意/拒绝/确认收货/确认拦截/人工重试。
 *
 * <p>收成一个 hook 是因为订单列表与退款工作台用的是同一批端点与同一套失效口径——
 * 两处各写一遍 mutation，只会在「拦截按钮漏接失效」这类地方慢慢分叉。
 * 失效集合由调用方给（列表行与工作台要刷新的树不同），消息文案在这里统一。
 */
export function useRefundActions(invalidates: readonly (readonly unknown[])[]) {
    const agree = useMutation({
        mutationFn: (args: RefundActionArgs) =>
            SellerOrdersApi.agreeRefund({ path: { id: args.orderId } }),
        meta: {
            success: message("order.toast.agreeAfterSale"),
            invalidates,
        },
    })

    const reject = useMutation({
        mutationFn: (args: RefundActionArgs & { reason: string }) =>
            SellerOrdersApi.rejectRefund({
                path: { id: args.orderId },
                body: { reason: args.reason },
            }),
        meta: {
            success: message("order.toast.rejectAfterSale"),
            invalidates,
        },
    })

    const receive = useMutation({
        mutationFn: (args: RefundActionArgs) =>
            SellerOrdersApi.receiveReturn({ path: { id: args.orderId } }),
        meta: {
            success: message("order.toast.refundConfirmed"),
            invalidates,
        },
    })

    // 确认拦截：货已离开买家、不再退回，钱不出；与「确认收货」是已寄回这一态上的两条相反出口
    const intercept = useMutation({
        mutationFn: (args: RefundActionArgs) =>
            SellerOrdersApi.interceptReturn({ path: { id: args.orderId } }),
        meta: {
            success: message("order.toast.refundIntercepted"),
            invalidates,
        },
    })

    // 人工重试：自动重试耗尽后的出口（失败 → 退款中），渠道侧用退款单号做幂等键
    const retry = useMutation({
        mutationFn: (args: RefundActionArgs) =>
            SellerOrdersApi.retryRefund({ path: { id: args.orderId } }),
        meta: {
            success: message("order.toast.refundRetried"),
            invalidates,
        },
    })

    return { agree, reject, receive, intercept, retry }
}
