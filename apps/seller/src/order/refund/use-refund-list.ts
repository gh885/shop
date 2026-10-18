import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useOutOfRangePageGuard } from "@shop/app-kit/data"

import { afterSaleKeys, afterSaleListKeys, afterSaleListOptions, orderKeys } from "#/order/queries"
import { refundTabToStatus, type RefundTab } from "#/order/refund/model"
import { useRefundActions } from "#/order/refund/use-refund-actions"
import { useRowBusy } from "#/shared/lib/use-row-busy"

interface RefundSearch {
    tab: RefundTab
    page: number
    size: number
}

// 处理动作会同时改工作台列表、退款单详情（决策弹窗读它）与订单列表的售后角标：三棵树一起失效，少一棵就是旧视图
export function useRefundList(shopId: string, search: RefundSearch) {
    const navigate = useNavigate()
    const { busyId, run } = useRowBusy()

    const refunds = useQuery(
        afterSaleListOptions(shopId, {
            status: refundTabToStatus(search.tab),
            page: search.page,
            size: search.size,
        }),
    )

    // React Compiler 已接管缓存：回调不手动 memo，身份由编译器自动稳定
    // URL 侧的页签键叫 status（路由 schema 认它），hook 内部叫 tab：写回时换算，别把 tab 直接递进 URL
    function apply(next: Partial<RefundSearch>, replace = false) {
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

    // 越界页码收口：处理完退款单会流转出当前页签、列表收缩；数据落定后才判，修正用 replace 不留历史
    useOutOfRangePageGuard({
        page: search.page,
        total: refunds.data?.total,
        size: search.size,
        onFix: (page) => apply({ page }, true),
    })

    const actions = useRefundActions([
        afterSaleListKeys.lists(shopId),
        afterSaleKeys.details(shopId),
        orderKeys.lists(shopId),
    ])

    // busy 以 refundId 为准（表格按 refund.id 判禁用）、请求用 orderId：两个 id 在此分流，别让表格去猜
    const runRefundAction =
        <A extends { refundId: string; orderId: string }>(action: (args: A) => Promise<unknown>) =>
        (args: A) =>
            run(() => action(args))(args.refundId)

    return {
        refunds,
        records: refunds.data?.records ?? [],
        total: refunds.data?.total ?? 0,
        busyId,
        handleTabChange: (tab: RefundTab) => apply({ tab }),
        onPageChange: (page: number) => apply({ page }),
        agreeRefund: runRefundAction(actions.agree.mutateAsync),
        rejectRefund: runRefundAction(actions.reject.mutateAsync),
        receiveReturn: runRefundAction(actions.receive.mutateAsync),
        interceptReturn: runRefundAction(actions.intercept.mutateAsync),
        retryRefund: runRefundAction(actions.retry.mutateAsync),
    }
}
