import { useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"

import { Button, cn, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

import { useRecommendTabs } from "./queries"

/** 首页第四层：吸顶推荐条，吸在顶栏下方。扁平数组（猜你喜欢是普通一项），每页显示数量由容器宽度自动决定，首末页隐藏对应翻页按钮 */
export function RecommendBar() {
    const tabs = useRecommendTabs()
    const [page, setPage] = useState(0)

    // 测量一页能放多少个词：测量层与显示层同宽、单行，累计宽度（含 gap）直到放不下
    const measureRef = useRef<HTMLDivElement>(null)
    const [pageSize, setPageSize] = useState(0)

    const items = tabs.data?.map((t) => t.name) ?? []
    // 默认选中项：is_default 标"猜你喜欢"；前端仍以首项为高亮兜底
    const defaultName = tabs.data?.find((t) => t.isDefault)?.name ?? items[0]

    useLayoutEffect(() => {
        const el = measureRef.current
        if (!el) return

        const measure = () => {
            const containerWidth = el.clientWidth
            const children = [...el.children].filter(
                (c): c is HTMLElement => c instanceof HTMLElement,
            )
            let used = 0
            let count = 0
            for (let i = 0; i < children.length; i++) {
                if (i > 0) used += 16 // gap-4
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
    }, [])

    const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
    const clampedPage = Math.min(page, totalPages - 1)
    const visible = items.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)

    const prevPage = () => setPage((p) => Math.max(0, p - 1))
    const nextPage = () => setPage((p) => Math.min(totalPages - 1, p + 1))
    const refresh = () => setPage(0)

    if (!tabs.data) {
        return (
            <div className="sticky top-(--home-header-height) z-30">
                <div className="bg-background/95 backdrop-blur">
                    <div className="mx-auto max-w-page px-6 py-3">
                        <Skeleton className="h-6 w-1/2 rounded-sm" />
                    </div>
                    <div className="feed-divider" />
                </div>
            </div>
        )
    }

    return (
        <div className="sticky top-(--home-header-height) z-30">
            <div className="bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-page items-center gap-4 px-6 py-3">
                    {/* 左侧往回翻页：第一页隐藏 */}
                    {clampedPage > 0 && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={prevPage}
                                        aria-label="上一组"
                                    >
                                        <ChevronLeft className="size-5" />
                                    </Button>
                                }
                            />
                            <TooltipContent>上一组</TooltipContent>
                        </Tooltip>
                    )}
                    {/* 视窗容器：与测量层同宽同布局 */}
                    <div className="relative flex flex-1 items-center gap-4 overflow-hidden">
                        {/* 测量层：隐藏、单行，累计宽度算出一页能放几个词 */}
                        <div
                            ref={measureRef}
                            aria-hidden
                            className="invisible absolute inset-0 flex gap-4"
                        >
                            {items.map((tab) => (
                                <span
                                    key={tab}
                                    className="shrink-0 whitespace-nowrap text-base"
                                >
                                    {tab}
                                </span>
                            ))}
                        </div>
                        {/* 当前页可见项 */}
                        {visible.map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                className={cn(
                                    "shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-base transition-colors",
                                    tab === defaultName
                                        ? "font-medium text-foreground"
                                        : "text-muted-foreground hover:text-primary",
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    {/* 右侧翻页：最后一页隐藏 */}
                    {clampedPage < totalPages - 1 && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={nextPage}
                                        aria-label="下一组"
                                    >
                                        <ChevronRight className="size-5" />
                                    </Button>
                                }
                            />
                            <TooltipContent>下一组</TooltipContent>
                        </Tooltip>
                    )}
                    {/* 刷新 */}
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={refresh}
                                    aria-label="刷新"
                                >
                                    <RefreshCw className="size-4" />
                                </Button>
                            }
                        />
                        <TooltipContent>刷新推荐</TooltipContent>
                    </Tooltip>
                </div>
                <div className="feed-divider" />
            </div>
        </div>
    )
}
