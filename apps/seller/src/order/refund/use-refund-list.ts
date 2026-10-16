import { message } from "#/locales/message"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { SellerOrdersApi } from "@shop/api/sdk"
import { useOutOfRangePageGuard } from "@shop/app-kit/data"

import { afterSaleKeys, afterSaleListKeys, afterSaleListOptions, orderKeys } from "#/order/queries"
import { refundTabToStatus, type RefundTab } from "#/order/refund/model"
import { useRowBusy } from "#/shared/lib/use-row-busy"

export interface RefundListSearch {
    tab: RefundTab
    page: number
    size: number
}

// 处理端点挂在订单资源下（/seller/orders/{id}/after-sales）但列表行是售后单：两个 id 都要
interface TicketActionArgs {
    ticketId: string
    orderId: string
}

// 处理动作会同时改工作台列表、售后单详情（决策弹窗读它）与订单列表的售后徽章：三棵树一起失效，少一棵就是旧视图
export function useRefundList(shopId: string, search: RefundListSearch) {
    const navigate = useNavigate()
    const { busyId, run } = useRowBusy()

    const tickets = useQuery(
        afterSaleListOptions(shopId, {
            status: refundTabToStatus(search.tab),
            page: search.page,
            size: search.size,
        }),
    )

    // React Compiler 已接管缓存：回调不手动 memo，身份由编译器自动稳定
    // URL 侧的页签键叫 status（路由 schema 认它），hook 内部叫 tab：写回时换算，别把 tab 直接递进 URL
    function apply(next: Partial<RefundListSearch>, replace = false) {
        void navigate({
            to: "/trade/refund",
            search: {
                status: next.tab ?? search.tab,
                // 换页签回到第 1 页；单纯翻页必须带 next.page，漏了翻页就变成「点了没反应」
                page: next.tab === undefined ? (next.page ?? search.page) : 1,
                size: search.size,
            },
            replace,
        })
    }

    // 越界页码收口：处理完售后单会流转出当前页签、列表收缩；数据落定后才判，修正用 replace 不留历史
    useOutOfRangePageGuard({
        page: search.page,
        total: tickets.data?.total,
        size: search.size,
        onFix: (page) => apply({ page }, true),
    })

    const invalidates = [
        afterSaleListKeys.lists(shopId),
        afterSaleKeys.details(shopId),
        orderKeys.lists(shopId),
    ]

    const agree = useMutation({
        mutationFn: (args: TicketActionArgs) =>
            SellerOrdersApi.agreeAfterSale({ path: { id: args.orderId } }),
        meta: {
            success: message("order.toast.agreeAfterSale"),
            invalidates,
        },
    })

    const reject = useMutation({
        mutationFn: (args: TicketActionArgs & { reason: string }) =>
            SellerOrdersApi.rejectAfterSale({
                path: { id: args.orderId },
                body: { reason: args.reason },
            }),
        meta: {
            success: message("order.toast.rejectAfterSale"),
            invalidates,
        },
    })

    const receive = useMutation({
        mutationFn: (args: TicketActionArgs) =>
            SellerOrdersApi.receiveReturn({ path: { id: args.orderId } }),
        meta: {
            success: message("order.toast.refundConfirmed"),
            invalidates,
        },
    })

    // busy 以 ticketId 为准（表格按 ticket.id 判禁用）、请求用 orderId：两个 id 在此分流，别让表格去猜
    const runTicketAction =
        <A extends TicketActionArgs>(action: (args: A) => Promise<unknown>) =>
        (args: A) =>
            run(() => action(args))(args.ticketId)

    return {
        tickets,
        records: tickets.data?.records ?? [],
        total: tickets.data?.total ?? 0,
        busyId,
        handleTabChange: (tab: RefundTab) => apply({ tab }),
        onPageChange: (page: number) => apply({ page }),
        agreeAfterSale: runTicketAction(agree.mutateAsync),
        rejectAfterSale: runTicketAction(reject.mutateAsync),
        receiveReturn: runTicketAction(receive.mutateAsync),
    }
}
