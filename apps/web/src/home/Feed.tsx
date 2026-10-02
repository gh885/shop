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
 * 首页商品流区块：推荐条（tab）+ 无限滚动网格 + 尾部四态。
 *
 * <p>为什么整块独立成组件、不写在路由里：tab 选中、已加载页数、哨兵、四种尾部状态都只属于这一块，
 * 写进 `routes/index.tsx` 会把它撑成第二个页面文件，且无限滚动没法单测（frontend.md：route 文件保持薄）。
 *
 * <p>tab 状态刻意留在组件内、不进 URL（理由见 docs/business-rules/cms.md WEB-01）：商品卡在新标签页打开，
 * 首页从不被离开；刷新回默认 tab 是淘宝 / 京东的既定行为。查询 key 仍含 tab（转成 categoryId），各 tab 各自缓存，切回不重拉。
 *
 * <p>切 tab 走 {@code startTransition}：feed 是**已揭示的** Suspense 边界，transition 期间 React 保留旧内容，
 * 不会把网格换成骨架。换成骨架的代价不只是闪一下——文档高度会先变一次，滚动位置被浏览器钳回顶部
 * （实测：滚到 900 再切 tab，scrollY 直接变 0）。{@code useSuspenseInfiniteQuery} 在实现里硬写了
 * {@code placeholderData: void 0}，占位数据那条路走不通，只能靠 transition。
 */

/** 自动加载封顶：8 页（≈192 张卡）之后换成「继续加载」按钮，避免一次浏览把接口与内存一路拉满 */
const MAX_AUTO_PAGES = 8

/** 哨兵提前量：一屏左右，滚到底之前就开始取下一页 */
const SENTINEL_MARGIN = "600px 0px"

export function Feed() {
    const queryClient = useQueryClient()
    const tabs = useQuery(recommendTabsOptions)
    const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
    const [isSwitching, startTransition] = useTransition()

    // 选中项：用户点过的 → 默认项（猜你喜欢）→ 首项。词条未就绪时没有选中项，feed 先走全站流
    const active =
        tabs.data?.find((tab) => tab.id === selectedId) ??
        tabs.data?.find((tab) => tab.isDefault) ??
        tabs.data?.[0]
    // tab → 类目的映射在前端做：只有 CATEGORY 型词条才圈定召回范围，其余（搜索型 / 无目标）一律全站
    const categoryId = feedCategoryId(active)

    /** 切词条：包在 transition 里，新词条的数据到位前旧卡片留在屏上（见类注释） */
    const selectTab = (tabId: string) => {
        startTransition(() => setSelectedId(tabId))
    }

    /** 换一批 = 丢掉已加载页、只重拉第一页（无游标 → 服务端发新种子 → 整屏重排）。
     *  不用 invalidateQueries：那会把已加载的 N 页串行全部重拉一遍（§4.4） */
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
            {/* 流式边界：loader 未预热该查询，useSuspenseInfiniteQuery 在此挂起，SSR 吐骨架、第一页 resolve 后流式补全。
                失败也收敛在这一块（QueryBoundary 的官方重置链路），不冒到根错误页把整页换掉 */}
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

/** 商品流网格：无限查询 + 末尾哨兵 + 尾部四态 */
function FeedGrid({ categoryId, switching }: { categoryId?: string; switching: boolean }) {
    const { locale } = useI18n()
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } =
        useSuspenseInfiniteQuery(feedOptions(categoryId))
    const sentinelRef = useRef<HTMLDivElement>(null)
    const sectionRef = useRef<HTMLElement>(null)
    const lastCategory = useRef(categoryId)
    const capped = data.pageCount >= MAX_AUTO_PAGES
    // 切词条中：屏上还是上一个词条的卡片（transition 保留的旧内容），这段窗口里 hasNextPage / capped
    // 说的都是上一个词条的处境，不能拿它去翻页或收口
    const busy = switching
    const empty = data.items.length === 0

    /**
     * 切词条后把列表锚回吸顶条下方。不做这件事的后果实测过：从「一页商品」切到「空词条」，
     * 文档高度 1987 → 988（≈视口高），浏览器把滚动位置从 900 直接钳回 0 —— 用户看到页面跳一下。
     *
     * <p>只在「词条真的换了」且「列表顶部已滚出视口」时锚（用户在顶部时不打扰），
     * 且在 useLayoutEffect 里做：绘帧前对齐，不留中间帧。
     */
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
                // 追加页在飞、占位中（切 tab）、没有下一页、或已到自动加载封顶：都不触发（封顶后由按钮显式继续）
                if (!hasNextPage || isFetchingNextPage || capped || busy) return
                void fetchNextPage()
            },
            { rootMargin: SENTINEL_MARGIN },
        )
        observer.observe(el)
        return () => observer.disconnect()
        // 依赖翻页状态：观察器的闭包要拿到最新的 hasNextPage / isFetchingNextPage，重建比读 ref 直观
    }, [hasNextPage, isFetchingNextPage, capped, busy, fetchNextPage])

    const loadMore = () => void fetchNextPage()

    return (
        <section
            ref={sectionRef}
            // 锚回时让吸顶栈（站点头 + 推荐条）压住的位置：scrollIntoView 认 scroll-margin
            className="feed-section scroll-mt-(--home-sticky-offset)"
            aria-busy={busy}
        >
            {empty ? (
                <FeedEmpty />
            ) : (
                <div
                    className={cn(
                        "grid-feed transition-opacity duration-200",
                        busy && "opacity-60",
                    )}
                >
                    {data.items.map((product) => (
                        <ProductCard
                            key={product.id}
                            product={toProductCardData(product, locale)}
                        />
                    ))}
                </div>
            )}
            {/* 空结果由空态收口：再挂一句「没有更多了」读起来像「前面还有，只是到底了」 */}
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
            {/* 哨兵：贴在网格末尾，rootMargin 提前一屏触发；封顶后它不再触发 */}
            <div
                ref={sentinelRef}
                aria-hidden
                className="h-px w-full"
            />
        </section>
    )
}

type FeedTailProps = {
    /** 已到自动加载封顶（后续要用户点「继续加载」） */
    capped: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    /** 追加页失败（`data` 还在，所以 suspense 查询不抛——就地重试，不整块替换） */
    isError: boolean
    /** 切 tab 中（屏上还是上一个 tab 的内容，尾部不能拿它的处境下结论） */
    busy: boolean
    onLoadMore: () => void
}

/**
 * 商品流尾部四态：追加中 / 追加失败（就地重试，保留已加载内容）/ 封顶后手动继续 / 到底。
 * 第一页失败不在这里：那条走 QueryBoundary（没有数据可保留，整块换错误态）。
 */
function FeedTail({
    capped,
    hasNextPage,
    isFetchingNextPage,
    isError,
    busy,
    onLoadMore,
}: FeedTailProps) {
    // 切 tab 中或追加页在飞：尾部只说「在加载」，不显示上一个 tab 的「没有更多了」（会闪一下再变）
    if (busy || isFetchingNextPage) {
        return <FeedTailLoading />
    }
    if (isError) {
        return (
            <div className="flex items-center justify-center gap-3 py-8">
                <span className="text-sm text-muted-foreground">加载失败</span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onLoadMore}
                >
                    重试
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
                    继续加载
                </Button>
            </div>
        )
    }
    if (!hasNextPage) {
        return (
            <div className="flex items-center justify-center py-8">
                <span className="text-sm text-muted-foreground">没有更多了</span>
            </div>
        )
    }
    return undefined
}

/** 尾部加载态（追加页在飞 / 切 tab 占位中共用） */
function FeedTailLoading() {
    return (
        <div className="flex items-center justify-center gap-2 py-8">
            <Spinner className="size-4" />
            <span className="text-sm text-muted-foreground">加载中…</span>
        </div>
    )
}

/**
 * 该词条一件商品都没有时的空态。刻意区别于「没有更多了」：后者是「翻到底了」，
 * 这里的语义是「这个类目下现在没有商品」，并且要占住 `feed-section` 的保底高度
 * （否则切到空词条时页面塌成视口高，滚动位置被钳回顶部）。
 */
function FeedEmpty() {
    return (
        <Empty>
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <PackageSearch className="size-4 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>这个分类暂时没有商品</EmptyTitle>
                <EmptyDescription>换个词条逛逛，或稍后再回来看看。</EmptyDescription>
            </EmptyHeader>
        </Empty>
    )
}

/** 商品流挂起占位：骨架高度对齐商品卡（正方形图 + 92px 信息区）的整卡比例，避免加载完跳版 */
export function FeedSkeleton() {
    return (
        <section className="feed-section">
            <div className="grid-feed">
                {Array.from({ length: FEED_PAGE_SIZE }, (_, i) => (
                    <Skeleton
                        key={i}
                        className="aspect-5/7 w-full rounded-lg"
                    />
                ))}
            </div>
        </section>
    )
}

/**
 * 商品流失败态。做成组件而不是模块作用域的渲染函数：要拿 locale 和本端 catalog，
 * 就得有真正的组件边界让 hook 站在里面（内联箭头函数还会每次渲染新建一个组件）。
 */
function FeedErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <section className="feed-section">
            <StateError
                message={errorText(toApiError(error), locale, t("common.loadFailed.feed"))}
                onRetry={reset}
            />
        </section>
    )
}
