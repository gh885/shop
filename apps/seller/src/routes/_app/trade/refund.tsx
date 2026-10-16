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
import { paginationSearchSchema } from "@shop/app-kit/data"
import { useState } from "react"

import { useT } from "#/locales/use-t"
import { AfterSaleDecisionDialog } from "#/order/after-sale-decision-dialog"
import type { SaleDecisionKind } from "#/order/after-sale-decision"
import { RefundTable, type RefundRowIdentity } from "#/order/refund/refund-table"
import { RefundTabs } from "#/order/refund/refund-tabs"
import { RefundTabSchema } from "#/order/refund/model"
import { useRefundList } from "#/order/refund/use-refund-list"
import { useShop } from "#/shop"

const listSearchSchema = paginationSearchSchema.extend({ status: RefundTabSchema })

export const Route = createFileRoute("/_app/trade/refund")({
    validateSearch: (search) => listSearchSchema.parse(search),
    component: RefundPage,
})

// 只存 ticket + kind：弹窗按 orderId 重拉售后单，涉及资金的决定别缓存列表里的旧行
type RefundDecision = {
    ticket: RefundRowIdentity
    kind: SaleDecisionKind
}

function RefundPage() {
    const t = useT()
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

    // 必须 return 动作的 promise：弹窗按结果决定失败不关窗、把 422 落到理由框
    const runDecision = (reason: string) => {
        if (!decision) return
        const args = { ticketId: decision.ticket.id, orderId: decision.ticket.orderId }
        if (decision.kind === "agree") return agreeAfterSale(args)
        if (decision.kind === "reject") return rejectAfterSale({ ...args, reason })
        return receiveReturn(args)
    }

    return (
        <div className="space-y-5">
            <RefundTabs
                value={search.status}
                onChange={handleTabChange}
            />

            {tickets.isPending ? (
                <DataTableSkeleton columns={8} />
            ) : records.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <PackageOpen />
                        </EmptyMedia>
                        <EmptyTitle>{t("order.refund.empty.title")}</EmptyTitle>
                        <EmptyDescription>{t("order.refund.empty.description")}</EmptyDescription>
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
