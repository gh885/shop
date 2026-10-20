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
import { useState } from "react"

import { useT } from "#/locales/use-t"
import { AfterSaleDecisionDialog } from "#/domains/order/after-sale-decision-dialog"
import type { SaleDecisionKind } from "#/domains/order/after-sale-decision"
import { RefundTable, type RefundRowIdentity } from "#/domains/order/refund/refund-table"
import { RefundTabs } from "#/domains/order/refund/refund-tabs"
import { refundListSearchSchema } from "#/domains/order/refund/search"
import { useRefundList } from "#/domains/order/refund/use-refund-list"
import { useShop } from "#/domains/shop"

export const Route = createFileRoute("/_app/trade/refund")({
    validateSearch: refundListSearchSchema,
    component: RefundPage,
})

// 只存 refund + kind：弹窗按 orderId 重拉退款单，涉及资金的决定别缓存列表里的旧行
type RefundDecision = {
    refund: RefundRowIdentity
    kind: SaleDecisionKind
}

function RefundPage() {
    const t = useT()
    const search = Route.useSearch()
    const shop = useShop()
    const {
        refunds,
        records,
        total,
        busyId,
        handleTabChange,
        onPageChange,
        agreeRefund,
        rejectRefund,
        receiveReturn,
        interceptReturn,
        retryRefund,
    } = useRefundList(shop.id, { tab: search.status, page: search.page, size: search.size })

    const [decision, setDecision] = useState<RefundDecision | undefined>()

    // 必须 return 动作的 promise：弹窗按结果决定失败不关窗、把 422 落到理由框
    const runDecision = (reason: string) => {
        if (!decision) return
        const args = { refundId: decision.refund.id, orderId: decision.refund.orderId }
        if (decision.kind === "agree") return agreeRefund(args)
        if (decision.kind === "reject") return rejectRefund({ ...args, reason })
        if (decision.kind === "receive") return receiveReturn(args)
        if (decision.kind === "intercept") return interceptReturn(args)
        return retryRefund(args)
    }

    return (
        <div className="space-y-5">
            <RefundTabs
                value={search.status}
                onChange={handleTabChange}
            />

            {refunds.isPending ? (
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
                    onAction={(refund, action) => setDecision({ refund, kind: action })}
                />
            )}

            <AfterSaleDecisionDialog
                open={Boolean(decision)}
                onOpenChange={(open) => !open && setDecision(undefined)}
                kind={decision?.kind ?? "agree"}
                orderId={decision?.refund.orderId}
                orderNo={decision?.refund.orderNo}
                shopId={shop.id}
                onConfirm={runDecision}
            />
        </div>
    )
}
