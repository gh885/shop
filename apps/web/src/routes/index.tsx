import { useLayoutEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react"

import { Button, Skeleton } from "@shop/ui-web"

import { Sticky } from "../shared/ui/sticky"
import { HomeCategoryNav } from "#/features/home/home-category-nav"
import { UserCard } from "#/features/home/user-card"
import { ProductCard, type ProductCardData } from "#/features/home/product-card"
import {
    bannersOptions,
    feedOptions,
    homeNavOptions,
    recommendTabsOptions,
    useBanners,
    useFeedProducts,
    useHomeNav,
    useRecommendTabs,
} from "#/features/home/use-home"
import type { Banner, BuyerProduct, NavEntry, RecommendTab } from "#/features/home/model"

/** 第一层顶栏高度（px）。第五层吸顶时以此为 top 偏移。 */
export const HOME_HEADER_HEIGHT = 64

export const Route = createFileRoute("/")({
    // SSR 首屏预取首页数据：SSR-query 集成会把 queryClient 缓存序列化给客户端，水合后 useQuery 直接命中缓存、首屏不闪骨架
    // allSettled：单个接口失败不拖垮整页，页面照常渲染（该块显示骨架兜底）
    loader: async ({ context }) => {
        await Promise.allSettled([
            context.queryClient.ensureQueryData(homeNavOptions),
            context.queryClient.ensureQueryData(bannersOptions),
            context.queryClient.ensureQueryData(recommendTabsOptions),
            context.queryClient.ensureQueryData(feedOptions),
        ])
    },
    component: Home,
    head: () => ({
        meta: [{ title: "Shop - 多店铺电商平台" }],
    }),
})

function Home() {
    const nav = useHomeNav()
    const banners = useBanners()
    const tabs = useRecommendTabs()
    const feed = useFeedProducts()

    return (
        <div>
            <HomeHeader />
            <CategoryCards
                nav={nav.data}
                banners={banners.data}
            />
            <RecommendBar tabs={tabs.data} />
            <ProductGrid products={feed.data} />
        </div>
    )
}

/** 第四层：吸顶推荐条，吸在顶栏下方。扁平数组（猜你喜欢是普通一项），每页显示数量由容器宽度自动决定，首末页隐藏对应翻页按钮 */
function RecommendBar({ tabs }: { tabs: RecommendTab[] | undefined }) {
    const [page, setPage] = useState(0)

    // 测量一页能放多少个词：测量层与显示层同宽、单行，累计宽度（含 gap）直到放不下
    const measureRef = useRef<HTMLDivElement>(null)
    const [pageSize, setPageSize] = useState(0)

    const items = tabs?.map((t) => t.name) ?? []
    // 默认选中项：is_default 标"猜你喜欢"；前端仍以首项为高亮兜底
    const defaultName = tabs?.find((t) => t.isDefault)?.name ?? items[0]

    useLayoutEffect(() => {
        const el = measureRef.current
        if (!el) return

        const measure = () => {
            const containerWidth = el.clientWidth
            const children = [...el.children] as HTMLElement[]
            let used = 0
            let count = 0
            for (let i = 0; i < children.length; i++) {
                if (i > 0) used += 16 // gap-4
                used += children[i].offsetWidth
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

    if (!tabs) {
        return (
            <Sticky top={HOME_HEADER_HEIGHT}>
                <div className="bg-background/95 backdrop-blur">
                    <div className="mx-auto max-w-[1400px] px-6 py-3">
                        <Skeleton className="h-6 w-1/2 rounded" />
                    </div>
                    <div className="mx-auto max-w-[1400px] border-t border-border/60 px-6" />
                </div>
            </Sticky>
        )
    }

    return (
        <Sticky top={HOME_HEADER_HEIGHT}>
            <div className="bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3">
                    {/* 左侧往回翻页：第一页隐藏 */}
                    {clampedPage > 0 && (
                        <button
                            type="button"
                            onClick={prevPage}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                            aria-label="上一组"
                        >
                            <ChevronLeft className="size-5" />
                        </button>
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
                                className={`shrink-0 whitespace-nowrap text-base transition-colors ${
                                    tab === defaultName
                                        ? "font-semibold text-primary"
                                        : "text-muted-foreground hover:text-primary"
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    {/* 右侧翻页：最后一页隐藏 */}
                    {clampedPage < totalPages - 1 && (
                        <button
                            type="button"
                            onClick={nextPage}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                            aria-label="下一组"
                        >
                            <ChevronRight className="size-5" />
                        </button>
                    )}
                    {/* 刷新 */}
                    <button
                        type="button"
                        onClick={refresh}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                        aria-label="刷新"
                    >
                        <RefreshCw className="size-4" />
                    </button>
                </div>
                <div className="mx-auto max-w-[1400px] border-t border-border/60 px-6" />
            </div>
        </Sticky>
    )
}

/** 买家商品 → 商品卡片。sales/tags/shop 后端 ProductResponse 暂缺，先不映射（见 actions.fetchFeedProducts TODO） */
function toProductCardData(p: BuyerProduct): ProductCardData {
    return { id: p.id, image: p.image, title: p.title, price: p.price }
}

/** 第五层：商品卡片网格 */
function ProductGrid({ products }: { products: BuyerProduct[] | undefined }) {
    return (
        <section className="mx-auto max-w-[1400px] px-6 py-6">
            <div className="grid grid-cols-5 gap-3 rounded-xl bg-sunken/50 p-3">
                {products
                    ? products.map((product) => (
                          <ProductCard
                              key={product.id}
                              product={toProductCardData(product)}
                          />
                      ))
                    : Array.from({ length: 10 }, (_, i) => (
                          <Skeleton
                              key={i}
                              className="aspect-square w-full rounded-lg"
                          />
                      ))}
            </div>
        </section>
    )
}

/** 第二层：左侧分类导航 + 中间三个运营位 + 最右用户卡片 */
function CategoryCards({
    nav,
    banners,
}: {
    nav: NavEntry[] | undefined
    banners: Banner[] | undefined
}) {
    return (
        <section className="mx-auto max-w-[1400px] px-6 py-6">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_250px] gap-4">
                <HomeCategoryNav
                    defaultHeight={200}
                    entries={nav}
                />
                {banners
                    ? banners.slice(0, 3).map((banner) => (
                          <button
                              key={banner.id}
                              type="button"
                              className="group relative h-[200px] overflow-hidden rounded-xl text-left"
                          >
                              <img
                                  src={banner.image}
                                  alt={banner.title}
                                  loading="lazy"
                                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                              <div className="absolute inset-x-0 bottom-0 p-4">
                                  <div className="text-base font-bold text-white">
                                      {banner.title}
                                  </div>
                                  {banner.subtitle && (
                                      <div className="mt-0.5 text-xs text-white/80">
                                          {banner.subtitle}
                                      </div>
                                  )}
                              </div>
                          </button>
                      ))
                    : Array.from({ length: 3 }, (_, i) => (
                          <Skeleton
                              key={i}
                              className="h-[200px] rounded-xl"
                          />
                      ))}
                <UserCard />
            </div>
        </section>
    )
}

/** 第一层：sticky 顶栏，左侧 logo，中间大搜索框（整体圆角容器 + 热搜词） */
function HomeHeader() {
    const [category, setCategory] = useState("宝贝")

    return (
        <Sticky top={0}>
            <header
                className="border-b border-border/60 bg-background/95 backdrop-blur"
                style={{ height: HOME_HEADER_HEIGHT }}
            >
                <div className="mx-auto flex h-full max-w-[1400px] items-center gap-14 px-6">
                    {/* 品牌 logo：橙色文字 + 下方小字 */}
                    <Link
                        to="/"
                        className="flex shrink-0 items-baseline gap-1 leading-none"
                    >
                        <span className="text-3xl font-black tracking-tight text-primary">
                            Shop
                        </span>
                        <span className="text-xs font-semibold tracking-widest text-primary/70">
                            SHOP.COM
                        </span>
                    </Link>

                    {/* 中间大搜索框：整体圆角容器，分类下拉 + 输入框 + 搜索按钮 */}
                    <div className="mx-auto w-full max-w-3xl">
                        <div className="flex h-12 items-center rounded-xl border-2 border-primary bg-background">
                            {/* 分类下拉：橙色文字 + 箭头，竖线分隔 */}
                            <button
                                type="button"
                                onClick={() => setCategory(category === "宝贝" ? "全部" : "宝贝")}
                                className="flex shrink-0 items-center gap-1 pl-5 pr-3 text-base font-medium text-primary transition-colors hover:text-primary-hover"
                            >
                                {category}
                                <ChevronDown className="size-4" />
                            </button>
                            <span className="h-5 w-px bg-border" />

                            <input
                                placeholder="搜索商品"
                                className="h-full flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
                            />

                            <Button className="m-1 h-10 shrink-0 gap-1 rounded-lg bg-primary px-6 text-base">
                                <Search className="size-4" />
                                搜索
                            </Button>
                        </div>
                    </div>
                </div>
            </header>
        </Sticky>
    )
}
