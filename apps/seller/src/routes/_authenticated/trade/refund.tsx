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
import { RmaTable, type RmaRowIdentity } from "#/domains/order/refund/refund-table"
import { RmaTabs } from "#/domains/order/refund/refund-tabs"
import { rmaListSearchSchema } from "#/domains/order/refund/search"
import { useRmaList } from "#/domains/order/refund/use-refund-list"
import { useShop } from "#/domains/shop"

export const Route = createFileRoute("/_authenticated/trade/refund")({
    validateSearch: rmaListSearchSchema,
    component: RmaPage,
})

// 只存售后单 + kind：弹窗按 id 重拉当前状态，涉及资金的决定别缓存列表里的旧行
type RmaDecision = {
    rma: RmaRowIdentity
    kind: SaleDecisionKind
}

function RmaPage() {
    const t = useT()
    const search = Route.useSearch()
    const shop = useShop()
    const {
        cases,
        records,
        nextCursor,
        busyId,
        handleTabChange,
        onLoadMore,
        agreeRma,
        rejectRma,
        receiveRma,
        confirmRefund,
    } = useRmaList(shop.id, { tab: search.status, cursor: search.cursor })

    const [decision, setDecision] = useState<RmaDecision | undefined>()

    // 必须 return 动作的 promise：弹窗按结果决定失败不关窗、把 422 落到理由框
    const runDecision = (reason: string) => {
        if (!decision) return
        if (decision.kind === "agree") return agreeRma(decision.rma.id)
        if (decision.kind === "reject") return rejectRma({ caseId: decision.rma.id, reason })
        if (decision.kind === "receive") return receiveRma(decision.rma.id)
        return confirmRefund(decision.rma.id)
    }

    return (
        <div className="space-y-5">
            <RmaTabs
                value={search.status}
                onChange={handleTabChange}
            />

            {cases.isPending ? (
                <DataTableSkeleton columns={6} />
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
                <RmaTable
                    rows={records}
                    nextCursor={nextCursor}
                    busyId={busyId}
                    onLoadMore={onLoadMore}
                    onAction={(rma, action) => setDecision({ rma, kind: action })}
                />
            )}

            <AfterSaleDecisionDialog
                open={Boolean(decision)}
                onOpenChange={(open) => !open && setDecision(undefined)}
                kind={decision?.kind ?? "agree"}
                caseId={decision?.rma.id}
                orderNo={decision?.rma.caseNo}
                shopId={shop.id}
                onConfirm={runDecision}
            />
        </div>
    )
}
