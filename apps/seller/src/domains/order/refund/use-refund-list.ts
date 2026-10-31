import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { orderKeys, rmaKeys, rmaListOptions } from "#/domains/order/queries"
import { rmaTabToStatus, type RmaTab } from "#/domains/order/refund/search"
import { useRmaActions } from "#/domains/order/refund/use-refund-actions"
import { useRowBusy } from "#/shared/lib/use-row-busy"

interface RmaSearch {
    tab: RmaTab
    cursor?: string
}

// 处理动作会同时改工作台列表、售后单详情（决策弹窗读它）与订单列表：三棵树一起失效，少一棵就是旧视图
export function useRmaList(shopId: string, search: RmaSearch) {
    const navigate = useNavigate()
    const { busyId, run } = useRowBusy()

    const cases = useQuery(
        rmaListOptions(shopId, { status: rmaTabToStatus(search.tab), cursor: search.cursor }),
    )

    // URL 侧的页签键叫 status（路由 schema 认它），hook 内部叫 tab：写回时换算，别把 tab 直接递进 URL
    function apply(next: Partial<RmaSearch>, replace = false) {
        void navigate({
            to: "/trade/refund",
            search: {
                status: next.tab ?? search.tab,
                // 换页签丢掉游标；单纯加载下一页必须带 next.cursor
                cursor: next.tab === undefined ? next.cursor : undefined,
            },
            replace,
        })
    }

    const actions = useRmaActions([rmaKeys.lists(shopId), rmaKeys.all, orderKeys.lists(shopId)])

    // busy 以售后单 id 为准（表格按 id 判禁用）、请求同样用 id：两个 id 在此对齐
    return {
        cases,
        records: cases.data?.items ?? [],
        nextCursor: cases.data?.nextCursor ?? undefined,
        busyId,
        handleTabChange: (tab: RmaTab) => apply({ tab }),
        onLoadMore: () => apply({ cursor: cases.data?.nextCursor ?? undefined }),
        agreeRma: (caseId: string) => run(() => actions.agree.mutateAsync(caseId))(caseId),
        rejectRma: (args: { caseId: string; reason: string }) =>
            run(() => actions.reject.mutateAsync(args))(args.caseId),
        receiveRma: (caseId: string) => run(() => actions.receive.mutateAsync(caseId))(caseId),
        confirmRefund: (caseId: string) => run(() => actions.refund.mutateAsync(caseId))(caseId),
    }
}
