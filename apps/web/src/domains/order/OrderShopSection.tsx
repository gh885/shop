import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Button, Image, Panel, PanelContent, PanelHeader } from "@shop/ui-web"

import { carrierLabel } from "@shop/common/domain"

import { useT } from "#/locales/use-t"
import type { WebMessageKey, WebTranslate } from "#/locales/messages.gen"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"
import { Price } from "#/shared/ui/Price"
import { BuyerTraceControllerApi } from "@shop/api/sdk"

import { ORDER_ITEM_ACTIONS } from "./constants"
import { orderItemActionLabel } from "./order-label"
import { sellerPackagesOptions } from "./queries"
import { orderItemKey, type OrderItem, type OrderItemAction } from "./rules"

export interface OrderShopSectionProps {
    order: { shopId: string; orderNo: string }
    items: OrderItem[]
    /** 子单 id：发货后用它取包裹，算「N 天后自动确认收货」倒计时 */
    sellerOrderId?: string
    /** 子单有在途包裹（shipped / partial_shipped）才查询 */
    shipping?: boolean
    canApplyAfterSale?: boolean
    onItemAction?: (action: OrderItemAction, item: OrderItem) => void
}

export function OrderShopSection({
    order,
    items,
    sellerOrderId,
    shipping = false,
    canApplyAfterSale = false,
    onItemAction,
}: OrderShopSectionProps) {
    const t = useT()
    const [logisticsOpen, setLogisticsOpen] = useState(false)
    const itemActions = ORDER_ITEM_ACTIONS.filter(
        (key) => key !== "after_sale" || canApplyAfterSale,
    )
    return (
        <Panel>
            <PanelHeader>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex size-5 items-center justify-center rounded bg-secondary text-xs font-bold text-secondary-foreground">
                        {t("order.shop.badge")}
                    </span>
                    <span className="text-sm font-medium text-foreground">{order.orderNo}</span>
                    {sellerOrderId && shipping && (
                        <AutoReceiveCountdown sellerOrderId={sellerOrderId} />
                    )}
                </div>
                <div className="ml-auto flex items-center gap-1">
                    {sellerOrderId && shipping && (
                        <Button
                            variant="link"
                            size="sm"
                            onClick={() => setLogisticsOpen((open) => !open)}
                        >
                            {t("order.action.logistics")}
                        </Button>
                    )}
                    <Button
                        variant="link"
                        size="sm"
                    >
                        {t("order.shop.snapshot")}
                    </Button>
                </div>
            </PanelHeader>

            <PanelContent>
                {logisticsOpen && sellerOrderId && <LogisticsPanel sellerOrderId={sellerOrderId} />}
                {items.map((item) => (
                    <div
                        key={orderItemKey(item)}
                        className="grid grid-cols-2 items-center gap-4 px-5 py-4 xl:flex"
                    >
                        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                            <Image
                                src={item.image}
                                alt={item.title}
                                className="size-full"
                            />
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm text-foreground">{item.title}</p>
                        </div>

                        <div className="w-20 shrink-0 text-right text-sm">
                            <Price
                                value={item.price}
                                className="text-foreground"
                            />
                            <span className="ml-1 text-xs text-muted-foreground">
                                x{item.quantity}
                            </span>
                        </div>

                        <div className="w-20 shrink-0 text-right text-sm">
                            <Price
                                value={item.amount}
                                className="text-foreground"
                            />
                        </div>

                        <div className="col-span-2 flex flex-wrap gap-2 xl:w-40 xl:shrink-0 xl:flex-col xl:items-end">
                            {itemActions.map((key) => (
                                <Button
                                    key={key}
                                    variant="outline"
                                    size="sm"
                                    className="min-w-24"
                                    onClick={() => onItemAction?.(key, item)}
                                >
                                    {orderItemActionLabel(key, t)}
                                </Button>
                            ))}
                        </div>
                    </div>
                ))}
            </PanelContent>
        </Panel>
    )
}

/**
 * 包裹物流：每个包裹一段——承运商 + 运单号 + 最新状态，时间线默认只摊开最新两条，
 * 更多节点折在「展开更多物流明细」后面。数据来自 buyer 的轨迹端点（按子单查全部包裹）。
 */
function LogisticsPanel({ sellerOrderId }: { sellerOrderId: string }) {
    const { data: timelines } = useQuery({
        queryKey: ["order-logistics", sellerOrderId] as const,
        queryFn: ({ signal }) =>
            BuyerTraceControllerApi.buyerOrderTraces({ path: { sellerOrderId }, signal }),
    })
    if (!timelines?.length) return null
    return (
        <div className="mb-4 space-y-4 rounded-lg bg-muted/40 p-4">
            {timelines.map((pkg) => (
                <PackageTimeline
                    key={pkg.packageId}
                    pkg={pkg}
                />
            ))}
        </div>
    )
}

function PackageTimeline({
    pkg,
}: {
    pkg: {
        packageId: string
        carrierCode: string
        trackingNo: string
        traces: {
            id: string
            standardCode: string
            description: string
        }[]
    }
}) {
    const t = useT()
    // traces 按发生时间正序存；最新一条在末尾
    const latest = pkg.traces.at(-1)
    const [expanded, setExpanded] = useState(false)
    const visible = expanded ? pkg.traces : pkg.traces.slice(-2)
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{carrierLabel(pkg.carrierCode)}</span>
                <span className="font-mono text-xs text-muted-foreground">{pkg.trackingNo}</span>
                <span className="text-muted-foreground">
                    {latest && traceStatusLabel(t, latest.standardCode)}
                </span>
            </div>
            <ol className="space-y-1.5">
                {visible.map((trace) => (
                    <li
                        key={trace.id}
                        className="text-sm text-muted-foreground"
                    >
                        {trace.description}
                    </li>
                ))}
            </ol>
            {!expanded && pkg.traces.length > 2 && (
                <Button
                    variant="link"
                    size="sm"
                    onClick={() => setExpanded(true)}
                >
                    {t("order.logistics.expand")}
                </Button>
            )}
        </div>
    )
}

/** 轨迹标准码 → 展示态文案。与后端 StandardTraceCode 的展示词一一对应；EXCEPTION/UNKNOWN 兜到「运输中」 */
/** 动态 key 的宽口：standardCode 是运行时值，t 的强类型对不上——判权收在这一处（error-keys.ts 同款口径） */
function traceStatusLabel(t: WebTranslate, standardCode: string): string {
    const key = (
        standardCode in TRACE_STATUS_LABEL
            ? TRACE_STATUS_LABEL[standardCode as keyof typeof TRACE_STATUS_LABEL]
            : "order.logistics.status.in_transit"
    ) as WebMessageKey
    return t(key as never)
}

const TRACE_STATUS_LABEL = {
    COLLECTED: "order.logistics.status.collected",
    IN_TRANSIT: "order.logistics.status.in_transit",
    OUT_FOR_DELIVERY: "order.logistics.status.out_for_delivery",
    DELIVERED: "order.logistics.status.delivered",
    REJECTED: "order.logistics.status.rejected",
    RETURNED: "order.logistics.status.returned",
    EXCEPTION: "order.logistics.status.in_transit",
    UNKNOWN: "order.logistics.status.in_transit",
} as const

/**
 * 「N 天后自动确认收货」倒计时：取在途包裹里最近的 autoReceiveAt（fulfillment 按
 * shippedAt + 宽限期算好下发，前端不抄天数）。包裹已签收 / 还没发货时没有任何东西可倒，
 * 静默不渲染——一个提示条不值得占一个骨架屏。
 */
function AutoReceiveCountdown({ sellerOrderId }: { sellerOrderId: string }) {
    const t = useT()
    const { data: packages } = useQuery({
        ...sellerPackagesOptions(sellerOrderId),
        enabled: true,
    })
    const pending = (packages ?? [])
        .map((pkg) => pkg.autoReceiveAt)
        .filter((at): at is string => at !== null)
        .toSorted()
    const next = pending[0]
    const { seconds } = useDeadline(next ?? "")
    if (next === undefined || seconds <= 0) return null
    return (
        <span className="text-xs tabular-nums text-muted-foreground">
            {t("order.countdown.autoConfirmAfter", { time: formatCountdown(seconds) })}
        </span>
    )
}
