import { useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"

import type { RecommendTabResponse } from "@shop/api/sdk"
import { Button, cn, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

export type RecommendBarProps = {
    /** 词条：undefined = 还没读到（画骨架），[] = 运营没配（不画词条） */
    tabs: RecommendTabResponse[] | undefined
    isError: boolean
    activeId?: string
    onSelect: (tabId: string) => void
    onRefresh: () => void
}

export function RecommendBar({ tabs, isError, activeId, onSelect, onRefresh }: RecommendBarProps) {
    const t = useT("home")
    const [page, setPage] = useState(0)

    const measureRef = useRef<HTMLDivElement>(null)
    const [pageSize, setPageSize] = useState(0)

    const items = tabs ?? []

    useLayoutEffect(() => {
        const el = measureRef.current
        if (!el || !tabs) return

        const measure = () => {
            const containerWidth = el.clientWidth
            const children = [...el.children].filter(
                (c): c is HTMLElement => c instanceof HTMLElement,
            )
            let used = 0
            let count = 0
            for (let i = 0; i < children.length; i++) {
                if (i > 0) used += 16
                used += children[i]?.offsetWidth ?? 0
                if (used > containerWidth) break
                count++
            }
            setPageSize(count)
        }

        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [tabs])

    const totalPages = Math.max(1, Math.ceil(items.length / Math.max(1, pageSize)))
    const clampedPage = Math.min(page, totalPages - 1)
    const visible = items.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)

    const prevPage = () => setPage((p) => Math.max(0, p - 1))
    const nextPage = () => setPage((p) => Math.min(totalPages - 1, p + 1))

    if (!tabs) {
        if (isError) return undefined

        return (
            <div className="sticky top-(--home-header-height) z-sticky">
                <div className="bg-background">
                    <div className="mx-auto w-full max-w-page px-6 py-3">
                        <Skeleton className="h-6 w-1/2 rounded-sm" />
                    </div>
                    <div className="feed-divider" />
                </div>
            </div>
        )
    }

    return (
        <div className="sticky top-(--home-header-height) z-sticky">
            <div className="bg-background">
                <div className="mx-auto flex w-full max-w-page items-center gap-4 px-6 py-3">
                    {clampedPage > 0 && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={prevPage}
                                        aria-label={t("home.recommend.prevGroup")}
                                    >
                                        <ChevronLeft className="size-5" />
                                    </Button>
                                }
                            />
                            <TooltipContent>{t("home.recommend.prevGroup")}</TooltipContent>
                        </Tooltip>
                    )}
                    <div className="relative flex flex-1 items-center gap-4 overflow-hidden">
                        <div
                            ref={measureRef}
                            aria-hidden
                            className="invisible absolute inset-0 flex gap-4"
                        >
                            {items.map((tab) => (
                                <span
                                    key={tab.id}
                                    className="shrink-0 whitespace-nowrap text-sm"
                                >
                                    {tab.name}
                                </span>
                            ))}
                        </div>
                        {visible.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => onSelect(tab.id)}
                                aria-pressed={tab.id === activeId}
                                className={cn(
                                    "shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition-colors",
                                    tab.id === activeId
                                        ? "bg-primary-subtle font-semibold text-primary-subtle-foreground"
                                        : "text-foreground hover:text-primary",
                                )}
                            >
                                {tab.name}
                            </button>
                        ))}
                    </div>
                    {clampedPage < totalPages - 1 && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={nextPage}
                                        aria-label={t("home.recommend.nextGroup")}
                                    >
                                        <ChevronRight className="size-5" />
                                    </Button>
                                }
                            />
                            <TooltipContent>{t("home.recommend.nextGroup")}</TooltipContent>
                        </Tooltip>
                    )}
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={onRefresh}
                                    aria-label={t("home.recommend.refresh")}
                                >
                                    <RefreshCw className="size-4" />
                                </Button>
                            }
                        />
                        <TooltipContent>{t("home.recommend.refresh")}</TooltipContent>
                    </Tooltip>
                </div>
                <div className="feed-divider" />
            </div>
        </div>
    )
}
