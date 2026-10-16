import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { cn, Collapsible, CollapsibleTrigger } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

import { countNodes, sliceGroups, toTimelineRows, type TrackingGroup } from "./model"

const DEFAULT_COLLAPSED_COUNT = 2

export interface TrackingTimelineProps {
    groups: TrackingGroup[]
    collapsedCount?: number
    defaultExpanded?: boolean
    className?: string
}

export function TrackingTimeline({
    groups,
    collapsedCount = DEFAULT_COLLAPSED_COUNT,
    defaultExpanded = false,
    className,
}: TrackingTimelineProps) {
    const t = useT("logistics")
    const [expanded, setExpanded] = useState(defaultExpanded)

    const total = countNodes(groups)
    if (total === 0) {
        return (
            <p className={cn("py-4 text-sm text-muted-foreground", className)}>
                {t("logistics.timeline.empty")}
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
                            hasLineAbove={index > 0}
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
                            {row.node.location && (
                                <span className="mr-1 text-foreground">{row.node.location}</span>
                            )}
                            {row.node.text}
                        </p>
                    </li>
                ))}

                {collapsible && (
                    <li className="relative pl-6">
                        <Axis
                            dot="plain"
                            hasLineAbove
                            hasLineBelow={false}
                        />
                        <CollapsibleTrigger className="group flex items-center">
                            <span className="group-data-open:hidden">
                                {t("logistics.timeline.expand")}
                            </span>
                            <span className="hidden group-data-open:inline">
                                {t("logistics.timeline.collapse")}
                            </span>
                            <ChevronDown className="size-3.5 transition-transform group-data-open:rotate-180" />
                        </CollapsibleTrigger>
                    </li>
                )}
            </ol>
        </Collapsible>
    )
}

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
