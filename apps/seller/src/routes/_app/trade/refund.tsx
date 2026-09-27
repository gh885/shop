import { createFileRoute } from "@tanstack/react-router"
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    DataTableSkeleton,
} from "@shop/ui-web"
import { PackageOpen } from "lucide-react"
import { paginationSearchSchema } from "@shop/app-kit"
import { useState } from "react"

import { AfterSaleDecisionDialog } from "#/order/after-sale-decision-dialog"
import type { SaleDecisionKind } from "#/order/after-sale-decision"
import { RefundTable, type RefundRowIdentity } from "#/order/refund/refund-table"
import { RefundTabs } from "#/order/refund/refund-tabs"
import { RefundTabSchema } from "#/order/refund/model"
import { useRefundList } from "#/order/refund/use-refund-list"
import { useShop } from "#/shop"

/**
 * 退款售后工作台（/trade/refund）：本店售后单的待办与历史。
 *
 * 与订单列表的关系：订单列表是「按订单作业」（发货 + 顺带处理该单售后），
 * 这里是「按售后作业」——待处理多少、退货中多少一眼看清，不必在订单堆里翻。
 * 决策复用的是同一个 AfterSaleDecisionDialog：同一个不可逆决定，不该有两套说法。
 *
 * 页签默认「待处理」；页签与页码都进 URL，可分享可回退。
 */

const listSearchSchema = paginationSearchSchema.extend({ status: RefundTabSchema })

export const Route = createFileRoute("/_app/trade/refund")({
    validateSearch: (search) => listSearchSchema.parse(search),
    component: RefundPage,
})

/**
 * 决策目标：动作种类 + 这一行所需的三项——弹窗自己按 kind 组织文案与走向说明，
 * 并按 orderId 重拉一次售后单（列表可能是几分钟前拉的），所以不留整行售后单。
 * 动作种类直接用工作台下发的契约值（RefundRowAction 即弹窗的 kind，同一份词表）。
 */
type RefundDecision = {
    ticket: RefundRowIdentity
    kind: SaleDecisionKind
}

function RefundPage() {
    const search = Route.useSearch()
    const shop = useShop()
    const {
        tickets,
        records,
        total,
        busyId,
        handleTabChange,
        onPageChange,
        agreeAfterSale,
        rejectAfterSale,
        receiveReturn,
    } = useRefundList(shop.id, { tab: search.status, page: search.page, size: search.size })

    const [decision, setDecision] = useState<RefundDecision | undefined>()

    // 关弹窗由弹窗自己收尾（确认后 onOpenChange(false)）；这里只管把动作路由到对应 mutation，
    // 拒绝那一路把弹窗收的必填理由一起带过去
    const runDecision = (reason: string) => {
        if (!decision) return
        // 两个 id 各归其位：busy 态与请求路径（处理端点挂在订单资源下）
        const args = { ticketId: decision.ticket.id, orderId: decision.ticket.orderId }
        if (decision.kind === "agree") agreeAfterSale(args)
        else if (decision.kind === "reject") rejectAfterSale({ ...args, reason })
        else receiveReturn(args)
    }

    return (
        <div className="space-y-5">
            <RefundTabs
                value={search.status}
                onChange={handleTabChange}
            />

            {tickets.isLoading ? (
                <DataTableSkeleton columns={8} />
            ) : records.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <PackageOpen />
                        </EmptyMedia>
                        <EmptyTitle>没有符合条件的售后单</EmptyTitle>
                        <EmptyDescription>换个状态页签看看，或稍后再来</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <RefundTable
                    rows={records}
                    page={search.page}
                    pageSize={search.size}
                    total={total}
                    busyId={busyId}
                    onPageChange={onPageChange}
                    onAction={(ticket, action) => setDecision({ ticket, kind: action })}
                />
            )}

            <AfterSaleDecisionDialog
                open={Boolean(decision)}
                onOpenChange={(open) => !open && setDecision(undefined)}
                kind={decision?.kind ?? "agree"}
                orderId={decision?.ticket.orderId}
                orderNo={decision?.ticket.orderNo}
                shopId={shop.id}
                onConfirm={runDecision}
            />
        </div>
    )
}
