import { message } from "#/locales/message"
import { useMutation } from "@tanstack/react-query"
import { SellerRmaControllerApi } from "@shop/api/sdk"

/**
 * 卖家的五个售后决定：同意 / 拒绝 / 确认收货 / 确认退款 / 换货补发。
 *
 * <p>收成一个 hook 是因为订单列表与售后工作台用的是同一批端点与同一套失效口径——
 * 两处各写一遍 mutation，只会在「某个动作漏接失效」这类地方慢慢分叉。
 * 失效集合由调用方给（列表行与工作台要刷新的树不同），消息文案在这里统一。
 */
export function useRmaActions(invalidates: readonly (readonly unknown[])[]) {
    const agree = useMutation({
        mutationFn: (caseId: string) => SellerRmaControllerApi.approveCase({ path: { caseId } }),
        meta: {
            success: message("order.toast.agreeAfterSale"),
            invalidates,
        },
    })

    // 拒绝理由走后端 query 参数（POST /returns/{caseId}/reject?reason=...），不是 body
    const reject = useMutation({
        mutationFn: (args: { caseId: string; reason: string }) =>
            SellerRmaControllerApi.rejectCase({
                path: { caseId: args.caseId },
                query: { reason: args.reason },
            }),
        meta: {
            success: message("order.toast.rejectAfterSale"),
            invalidates,
        },
    })

    const receive = useMutation({
        mutationFn: (caseId: string) => SellerRmaControllerApi.receiveCase({ path: { caseId } }),
        meta: {
            success: message("order.toast.refundConfirmed"),
            invalidates,
        },
    })

    // 确认退款带幂等键：响应丢失后的重试原样返回第一次结果，而不是对已推进的状态弹 409
    const refund = useMutation({
        mutationFn: (caseId: string) =>
            SellerRmaControllerApi.confirmRefund({
                path: { caseId },
                headers: { "Idempotency-Key": crypto.randomUUID() },
            }),
        meta: {
            success: message("order.toast.refundConfirmed"),
            invalidates,
        },
    })

    // 换货补发：新运单号落进 case_log，进入 reshipping（7 天无异议自动完成）
    const reship = useMutation({
        mutationFn: (args: { caseId: string; carrierCode: string; trackingNo: string }) =>
            SellerRmaControllerApi.reshipCase({
                path: { caseId: args.caseId },
                query: { carrierCode: args.carrierCode, trackingNo: args.trackingNo },
            }),
        meta: {
            success: message("order.toast.reshipDone"),
            invalidates,
        },
    })

    return { agree, reject, receive, refund, reship }
}
