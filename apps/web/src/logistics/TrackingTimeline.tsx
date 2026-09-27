import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { cn, Collapsible, CollapsibleTrigger } from "@shop/ui-web"

import { countNodes, sliceGroups, toTimelineRows, type TrackingGroup } from "./model"

/**
 * 轨迹时间轴 —— 本页主体。
 *
 * 形态不是「节点平铺」，是「按状态分段」：段首带粗体状态标题与时间（如「运输中 07-28 11:12」），
 * 段内续行只有灰色时间。分段由 ./tracking.ts 的纯规则算好，本组件只认 `label` /
 * `latest` / `abnormal` 三个已判定的分级字段——不 import SDK 枚举、不推导状态、不排序。
 *
 * 折叠态（淘宝的「展开更多物流明细 ⌄」）留在组件内部：它没有第二个消费者，
 * 传 `expanded` prop 只会逼着调用方白养一个 useState。
 */

/** 折叠时默认保留的节点条数（跨段按轴序取最新 N 条），与淘宝收起态一致 */
const DEFAULT_COLLAPSED_COUNT = 2

export interface TrackingTimelineProps {
    /** 已分段、段间与段内均新 → 旧的轨迹轴 */
    groups: TrackingGroup[]
    /** 折叠时保留的节点条数，默认 2 */
    collapsedCount?: number
    /** 初始展开态，默认收起（与淘宝一致：先给最近两条，其余按需展开） */
    defaultExpanded?: boolean
    className?: string
}

export function TrackingTimeline({
    groups,
    collapsedCount = DEFAULT_COLLAPSED_COUNT,
    defaultExpanded = false,
    className,
}: TrackingTimelineProps) {
    const [expanded, setExpanded] = useState(defaultExpanded)

    const total = countNodes(groups)
    if (total === 0) {
        return (
            <p className={cn("py-4 text-sm text-muted-foreground", className)}>
                暂无物流轨迹，商家发货后会显示。
            </p>
        )
    }

    const collapsible = total > collapsedCount
    const rows = toTimelineRows(
        collapsible && !expanded ? sliceGroups(groups, collapsedCount) : groups,
    )

    return (
        <Collapsible
            open={expanded}
            onOpenChange={setExpanded}
        >
            <ol className={className}>
                {rows.map((row, index) => (
                    <li
                        key={row.key}
                        className="relative pb-4 pl-6 last:pb-0"
                    >
                        <Axis
                            dot={row.abnormal ? "abnormal" : row.node.latest ? "current" : "plain"}
                            /** 上段连线只在第一行省略：其余行的圆点都要连到上一行 */
                            hasLineAbove={index > 0}
                            /** 下段连线在最后一行省略；有折叠开关时由开关那一行当末行 */
                            hasLineBelow={index < rows.length - 1 || collapsible}
                        />
                        {row.head ? (
                            <p className="text-sm leading-6">
                                <span
                                    className={cn(
                                        row.node.latest ? "font-bold" : "font-medium",
                                        row.abnormal ? "text-destructive" : "text-foreground",
                                    )}
                                >
                                    {row.label}
                                </span>
                                <span
                                    className={cn(
                                        "ml-2",
                                        row.node.latest
                                            ? "font-medium text-foreground"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {row.node.time}
                                </span>
                            </p>
                        ) : (
                            <p className="text-sm leading-6 text-muted-foreground">
                                {row.node.time}
                            </p>
                        )}
                        <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                            {/* 位置前缀加深；不加【】——承运商推来的描述本身常常已经带了一个 */}
                            {row.node.location && (
                                <span className="mr-1 text-foreground">{row.node.location}</span>
                            )}
                            {row.node.text}
                        </p>
                    </li>
                ))}

                {/* 折叠开关也是轴上的一个节点（淘宝同款形态），所以复用同一套轴列布局 */}
                {collapsible && (
                    <li className="relative pl-6">
                        <Axis
                            dot="plain"
                            hasLineAbove
                            hasLineBelow={false}
                        />
                        <CollapsibleTrigger className="group flex items-center">
                            <span className="group-data-open:hidden">展开更多物流明细</span>
                            <span className="hidden group-data-open:inline">收起全部</span>
                            <ChevronDown className="size-3.5 transition-transform group-data-open:rotate-180" />
                        </CollapsibleTrigger>
                    </li>
                )}
            </ol>
        </Collapsible>
    )
}

/**
 * 轴列：圆点 + 上下两段连线。
 *
 * 连线按行画两段，而不是容器里拉一条通高竖线——行高由描述文字换行决定，
 * 通高竖线没法知道该在哪里收尾（最后一行必须停在圆点上，不能拖到文字底下）。
 * 圆点 `top-2 size-2` → 圆心 12px，正好压在 `leading-6`(24px) 标题行的垂直中线上。
 */
function Axis({
    dot,
    hasLineAbove,
    hasLineBelow,
}: {
    dot: "plain" | "current" | "abnormal"
    hasLineAbove: boolean
    hasLineBelow: boolean
}) {
    const dotClass =
        dot === "abnormal"
            ? "bg-destructive"
            : dot === "current"
              ? "bg-foreground"
              : "border border-border bg-background"

    return (
        <>
            {hasLineAbove && (
                <span
                    aria-hidden
                    className="absolute left-1 top-0 h-2 w-px -translate-x-1/2 bg-border"
                />
            )}
            {hasLineBelow && (
                <span
                    aria-hidden
                    className="absolute left-1 top-4 bottom-0 w-px -translate-x-1/2 bg-border"
                />
            )}
            <span
                aria-hidden
                className={cn("absolute left-0 top-2 size-2 rounded-full", dotClass)}
            />
        </>
    )
}
