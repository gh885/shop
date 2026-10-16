import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react"
import { useQuery, useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { PackageSearch } from "lucide-react"

import { QueryBoundary } from "@shop/app-kit/data"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { toApiError } from "@shop/common/contract"
import {
    Button,
    cn,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
    Spinner,
    StateError,
} from "@shop/ui-web"

import { ProductCard, toProductCardData } from "#/products"
import { useT } from "#/locales/use-t"

import { RecommendBar } from "./RecommendBar"
import { FEED_PAGE_SIZE, feedCategoryId, feedOptions, recommendTabsOptions } from "./queries"

/**
 * 切 tab 走 {@code startTransition}：feed 是**已揭示的** Suspense 边界，transition 期间 React 保留旧内容，
 * 不会把网格换成骨架。换成骨架的代价不只是闪一下——文档高度会先变一次，滚动位置被浏览器钳回顶部
 * （实测：滚到 900 再切 tab，scrollY 直接变 0）。{@code useSuspenseInfiniteQuery} 在实现里硬写了
 * {@code placeholderData: void 0}，占位数据那条路走不通，只能靠 transition。
 */

const MAX_AUTO_PAGES = 8

const SENTINEL_MARGIN = "600px 0px"

export function Feed() {
    const queryClient = useQueryClient()
    const tabs = useQuery(recommendTabsOptions)
    const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
    const [isSwitching, startTransition] = useTransition()

    const active =
        tabs.data?.find((tab) => tab.id === selectedId) ??
        tabs.data?.find((tab) => tab.isDefault) ??
        tabs.data?.[0]
    const categoryId = feedCategoryId(active)

    const selectTab = (tabId: string) => {
        startTransition(() => setSelectedId(tabId))
    }

    const refresh = () => {
        void queryClient.resetQueries({ queryKey: feedOptions(categoryId).queryKey })
    }

    return (
        <>
            <RecommendBar
                tabs={tabs.data}
                isError={tabs.isError}
                activeId={active?.id}
                onSelect={selectTab}
                onRefresh={refresh}
            />
            <QueryBoundary
                pending={<FeedSkeleton />}
                fallback={(args) => <FeedErrorFallback {...args} />}
            >
                <FeedGrid
                    categoryId={categoryId}
                    switching={isSwitching}
                />
            </QueryBoundary>
        </>
    )
}

function FeedGrid({ categoryId, switching }: { categoryId?: string; switching: boolean }) {
    const { locale } = useI18n()
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } =
        useSuspenseInfiniteQuery(feedOptions(categoryId))
    const sentinelRef = useRef<HTMLDivElement>(null)
    const sectionRef = useRef<HTMLElement>(null)
    const lastCategory = useRef(categoryId)
    const capped = data.pageCount >= MAX_AUTO_PAGES
    const busy = switching
    const empty = data.items.length === 0

    useLayoutEffect(() => {
        if (lastCategory.current === categoryId) return
        lastCategory.current = categoryId
        const el = sectionRef.current
        if (!el || el.getBoundingClientRect().top >= 0) return
        el.scrollIntoView({ block: "start", behavior: "instant" })
    }, [categoryId])

    useEffect(() => {
        const el = sentinelRef.current
        if (!el) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return
                if (!hasNextPage || isFetchingNextPage || capped || busy) return
                void fetchNextPage()
            },
            { rootMargin: SENTINEL_MARGIN },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [hasNextPage, isFetchingNextPage, capped, busy, fetchNextPage])

    const loadMore = () => void fetchNextPage()

    return (
        <section
            ref={sectionRef}
            className="feed-section scroll-mt-(--home-sticky-offset)"
            aria-busy={busy}
        >
            <div className={cn("home-module flex flex-1 flex-col p-3", busy && "opacity-60")}>
                {empty ? (
                    <div className="flex flex-1 items-center justify-center py-16">
                        <FeedEmpty />
                    </div>
                ) : (
                    <div className="grid-feed transition-opacity duration-200">
                        {data.items.map((product) => (
                            <ProductCard
                                key={product.id}
                                product={toProductCardData(product, locale)}
                            />
                        ))}
                    </div>
                )}
            </div>
            {empty ? undefined : (
                <FeedTail
                    capped={capped}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    isError={isFetchNextPageError}
                    busy={busy}
                    onLoadMore={loadMore}
                />
            )}
            <div
                ref={sentinelRef}
                aria-hidden
                className="h-px w-full"
            />
        </section>
    )
}

type FeedTailProps = {
    capped: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isError: boolean
    busy: boolean
    onLoadMore: () => void
}

function FeedTail({
    capped,
    hasNextPage,
    isFetchingNextPage,
    isError,
    busy,
    onLoadMore,
}: FeedTailProps) {
    const t = useT("home")
    if (busy || isFetchingNextPage) {
        return <FeedTailLoading />
    }
    if (isError) {
        return (
            <div className="flex items-center justify-center gap-3 py-8">
                <span className="text-sm text-muted-foreground">{t("home.feed.loadFailed")}</span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onLoadMore}
                >
                    {t("home.retry")}
                </Button>
            </div>
        )
    }
    if (capped && hasNextPage) {
        return (
            <div className="flex items-center justify-center py-8">
                <Button
                    variant="outline"
                    onClick={onLoadMore}
                >
                    {t("home.feed.loadMore")}
                </Button>
            </div>
        )
    }
    if (!hasNextPage) {
        return (
            <div className="flex items-center justify-center py-8">
                <span className="text-sm text-muted-foreground">{t("home.feed.noMore")}</span>
            </div>
        )
    }
    return undefined
}

function FeedTailLoading() {
    const t = useT("home")
    return (
        <div className="flex items-center justify-center gap-2 py-8">
            <Spinner className="size-4" />
            <span className="text-sm text-muted-foreground">{t("home.feed.loading")}</span>
        </div>
    )
}

function FeedEmpty() {
    const t = useT("home")
    return (
        <Empty>
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <PackageSearch className="size-4 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>{t("home.feed.emptyTitle")}</EmptyTitle>
                <EmptyDescription>{t("home.feed.emptyDescription")}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    )
}

export function FeedSkeleton() {
    return (
        <section className="feed-section">
            <div className="home-module flex-1 p-3">
                <div className="grid-feed">
                    {Array.from({ length: FEED_PAGE_SIZE }, (_, i) => (
                        <Skeleton
                            key={i}
                            className="aspect-5/7 w-full rounded-lg"
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}

function FeedErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <section className="feed-section">
            <div className="home-module flex flex-1 items-center justify-center p-6">
                <StateError
                    message={errorText(toApiError(error), locale, t("common.loadFailed.feed"))}
                    onRetry={reset}
                />
            </div>
        </section>
    )
}
