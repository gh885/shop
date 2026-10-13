import { useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"

import type { RecommendTabResponse } from "@shop/api/sdk"
import { Button, cn, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

/**
 * 首页第四层：吸顶推荐条，吸在顶栏下方。扁平数组（猜你喜欢是普通一项），每页显示数量由容器宽度自动决定，首末页隐藏对应翻页按钮。
 *
 * <p>受控组件：选中项与「换一批」都归 feed 区块（`home/Feed.tsx`）——切 tab 要换召回范围，
 * 状态留在这里就得往上抛回调，反而多一层。这里只负责「词条怎么排、怎么翻页、点了谁」。
 *
 * <p>表面与 HomeHeader / SiteHeader 同为不透明白（bg-background）：天猫式顶栏吸顶栈一色到底，
 * 内容从下面整块盖上，不用半透明 + 模糊——那会在滚动时把商品图透成一层脏白。
 */
export type RecommendBarProps = {
    /** 词条：undefined = 还没读到（画骨架），[] = 运营没配（不画词条） */
    tabs: RecommendTabResponse[] | undefined
    /** 读词条失败：整块不画（首页是门面，单个接口失败不该把整页换成错误页） */
    isError: boolean
    /** 当前选中的词条 id（由 feed 区块按「用户点过 → 默认项 → 首项」推导） */
    activeId?: string
    onSelect: (tabId: string) => void
    /** 「换一批」：换的是下面那屏商品，不是词条本身 */
    onRefresh: () => void
}

export function RecommendBar({ tabs, isError, activeId, onSelect, onRefresh }: RecommendBarProps) {
    const t = useT("home")
    const [page, setPage] = useState(0)

    // 测量一页能放多少个词：测量层与显示层同宽、单行，累计宽度（含 gap）直到放不下
    const measureRef = useRef<HTMLDivElement>(null)
    const [pageSize, setPageSize] = useState(0)

    const items = tabs ?? []

    useLayoutEffect(() => {
        const el = measureRef.current
        // 词条没到就没有测量层可量（首帧是骨架）：拿到词条后再量，否则一页算成 0 个、整条推荐栏空着
        if (!el || !tabs) return

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
    }, [tabs])

    const totalPages = Math.max(1, Math.ceil(items.length / Math.max(1, pageSize)))
    const clampedPage = Math.min(page, totalPages - 1)
    const visible = items.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)

    const prevPage = () => setPage((p) => Math.max(0, p - 1))
    const nextPage = () => setPage((p) => Math.min(totalPages - 1, p + 1))

    if (!tabs) {
        // 失败且无缓存（含 2xx 契约漂移）→ 不画这一块，别让失败永远停在骨架。
        // 有旧数据时不走这里：后台刷新失败不该把已有内容换成骨架
        if (isError) return undefined

        return (
            <div className="sticky top-(--home-header-height) z-30">
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
        <div className="sticky top-(--home-header-height) z-30">
            <div className="bg-background">
                <div className="mx-auto flex w-full max-w-page items-center gap-4 px-6 py-3">
                    {/* 左侧往回翻页：第一页隐藏 */}
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
                                    key={tab.id}
                                    className="shrink-0 whitespace-nowrap text-sm"
                                >
                                    {tab.name}
                                </span>
                            ))}
                        </div>
                        {/* 当前页可见项 */}
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
                    {/* 右侧翻页：最后一页隐藏 */}
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
                    {/* 换一批：换的是下面那屏商品（重置 feed 查询，服务端发新种子） */}
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
