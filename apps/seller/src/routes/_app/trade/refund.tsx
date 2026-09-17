import { createFileRoute } from "@tanstack/react-router"
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
    StateError,
} from "@shop/ui-web"
import { PackageOpen } from "lucide-react"
import { z } from "zod"
import { toApiError } from "@shop/common"
import { useState } from "react"

import { AfterSaleDecisionDialog, type SaleDecisionKind } from "#/order/after-sale-decision-dialog"
import { RefundTable, type RefundRowIdentity } from "#/order/refund/refund-table"
import { RefundTabs } from "#/order/refund/refund-tabs"
import { RefundTabSchema, type RefundRowAction } from "#/order/refund/model"
import { useRefundList } from "#/order/refund/use-refund-list"
import { useShop } from "#/shop"

/**
 * 退款售后工作台（/trade/refund）：本店售后单的待办与历史。
 *
 * 与订单列表的关系：订单列表是「按订单作业」（发货 + 顺带处理该单售后），
 * 这里是「按售后作业」——待处理多少、退货中多少一眼看清，不必在订单堆里翻。
 * 决策复用的是同一个 AfterSaleDecisionDialog：同一个不可逆决定，不该有两套说法。
 *
 * 页签默认「待处理」（见 model 的 DEFAULT_REFUND_TAB）；页签与页码都进 URL，可分享可回退。
 */

const listSearchSchema = z.object({
    status: RefundTabSchema,
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    page: z.coerce.number().int().min(1).catch(1),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    size: z.coerce.number().int().min(1).catch(10),
})

export const Route = createFileRoute("/_app/trade/refund")({
    validateSearch: (search) => listSearchSchema.parse(search),
    component: RefundPage,
})

/**
 * 决策目标：动作种类 + 这一行所需的三项——弹窗自己按 kind 组织文案与走向说明，
 * 并按 orderId 重拉一次售后单（列表可能是几分钟前拉的），所以不留整行售后单。
 */
type RefundDecision = {
    ticket: RefundRowIdentity
    kind: SaleDecisionKind
}

/** 行内动作 → 决策弹窗的动作种类（确认收货也在同一个弹窗里，只是说明不同） */
const ACTION_TO_KIND: Record<RefundRowAction, SaleDecisionKind> = {
    agree: "agree",
    reject: "reject",
    receive: "receive",
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
        onRetry,
        onPageChange,
        agreeAfterSale,
        rejectAfterSale,
        receiveReturn,
    } = useRefundList(shop.id, { tab: search.status, page: search.page, size: search.size })

    const [decision, setDecision] = useState<RefundDecision | undefined>()

    // 关弹窗由弹窗自己收尾（确认后 onOpenChange(false)）；这里只管把动作路由到对应 mutation
    const runDecision = () => {
        if (!decision) return
        // 两个 id 各归其位：busy 态与请求路径（处理端点挂在订单资源下，见 use-refund-list 的说明）
        const args = { ticketId: decision.ticket.id, orderId: decision.ticket.orderId }
        if (decision.kind === "agree") agreeAfterSale(args)
        else if (decision.kind === "reject") rejectAfterSale(args)
        else receiveReturn(args)
    }

    return (
        <div className="space-y-5">
            <RefundTabs
                value={search.status}
                onChange={handleTabChange}
            />

            {tickets.isError ? (
                <StateError
                    message={toApiError(tickets.error).detail}
                    onRetry={onRetry}
                    retrying={tickets.isFetching}
                />
            ) : tickets.isLoading ? (
                <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton
                            key={i}
                            className="h-14 w-full rounded-xl"
                        />
                    ))}
                </div>
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
                    onAction={(ticket, action) =>
                        setDecision({ ticket, kind: ACTION_TO_KIND[action] })
                    }
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
