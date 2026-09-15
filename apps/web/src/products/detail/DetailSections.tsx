import { useEffect, useState, type ReactNode } from "react"
import { MessageSquareOff } from "lucide-react"

import {
    Tabs,
    TabsList,
    TabsTrigger,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Card,
    CardContent,
    Skeleton,
    StateError,
} from "@shop/ui-web"

import { toProductCardData, type Product, type ProductDetail } from "../product"
import { imgUrl } from "#/shared/lib/image"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { toApiError } from "@shop/common"
import { ProductCard } from "../ProductCard"
import { shopProductsOptions, alsoViewedOptions } from "./queries"

export function DetailSection({
    id,
    title,
    children,
}: {
    id: string
    title: string
    children: ReactNode
}) {
    return (
        <Card
            id={id}
            // 无边框：页面底色已经是白，区块靠标题和留白分隔，不用描边
            variant="plain"
            className="mt-5 scroll-mt-20"
        >
            <CardContent>
                <h2 className="mb-4 border-l-4 border-primary pl-3 text-lg font-bold text-foreground">
                    {title}
                </h2>
                {children}
            </CardContent>
        </Card>
    )
}

/** 推荐流区块的布局类：`-mx-4` 抵消 DetailSection 卡片自身的 16px 内边距（--card-spacing），
 * 让网格铺满所在栏宽 —— 淘宝的推荐网格就是贴边的，不贴边卡片会小一圈（199 → 191）。 */
function recoGridClass(className: string): string {
    return `-mx-4 grid gap-4 ${className}`
}

/** 加载中：与网格同列数、同卡片尺寸，换到真内容时不跳 */
function RecoGridSkeleton({ className }: { className: string }) {
    return (
        <div
            className={recoGridClass(className)}
            aria-hidden
        >
            {Array.from({ length: 8 }, (_, i) => (
                <Skeleton
                    key={i}
                    className="aspect-5/7 w-full rounded-lg"
                />
            ))}
        </div>
    )
}

/** 有数据：纯展示网格（空数据由 RecoSection 判掉，这里只管画） */
function RecoGrid({
    products,
    currentId,
    className,
    variant,
}: {
    products: Product[]
    currentId: string
    className: string
    variant?: "default" | "compact"
}) {
    // 排除当前商品本身
    const list = products.filter((p) => p.id !== currentId)

    return (
        <div className={recoGridClass(className)}>
            {list.map((product) => (
                <ProductCard
                    key={product.id}
                    product={toProductCardData(product)}
                    variant={variant}
                />
            ))}
            {list.length === 0 && (
                <Empty className="col-span-full py-6">
                    <EmptyHeader>
                        <EmptyTitle>暂无推荐商品</EmptyTitle>
                    </EmptyHeader>
                </Empty>
            )}
        </div>
    )
}

/** 推荐流商品列表的查询形状（`fetchProducts` 的返回） */
type RecoQuery = UseQueryResult<{ records: Product[]; total: number }>

/**
 * 推荐流区块：**加载中 / 失败 / 空 / 有数据** 四态的唯一收敛点。
 *
 * 此前四态被压成了两态——`products === undefined` 就画骨架，失败也画骨架，
 * 于是接口挂了页面永远在转圈、用户没有任何重试入口。这里把失败显式分出来（StateError + 重试），
 * 空态交给网格自己（「暂无推荐商品」）。
 *
 * `query` 作为 prop 传整个 query 结果是刻意的：本组件的**职责就是渲染一个查询的四种状态**，
 * 属于 AGENTS.md 里「页面编排者/宽类型正当」的例外；网格本身（RecoGrid）仍是纯展示。
 */
function RecoSection({
    id,
    title,
    query,
    currentId,
    className,
    variant,
}: {
    id: string
    title: string
    query: RecoQuery
    currentId: string
    className: string
    variant?: "default" | "compact"
}) {
    return (
        <DetailSection
            id={id}
            title={title}
        >
            {query.isError ? (
                <StateError
                    message={toApiError(query.error).detail}
                    onRetry={() => void query.refetch()}
                    retrying={query.isFetching}
                />
            ) : query.isPending ? (
                <RecoGridSkeleton className={className} />
            ) : (
                <RecoGrid
                    products={query.data.records}
                    currentId={currentId}
                    className={className}
                    variant={variant}
                />
            )}
        </DetailSection>
    )
}

/** 左栏区块定义（顺序即 tab 顺序），也是 scrollspy 的观察目标 */
const DETAIL_SECTIONS = [
    { id: "reviews", label: "用户评价" },
    { id: "params", label: "参数信息" },
    { id: "detail", label: "图文详情" },
    { id: "shop-reco", label: "本店推荐" },
    { id: "also-viewed", label: "看了又看" },
] as const

/**
 * 商品详情左栏主体：吸顶 tab + 评价/参数/图文详情三个区块。
 * 本店推荐与看了又看作为独立 widget 跟在后面，便于各自维护数据请求。
 */
export function DetailSections({ detail }: { detail: ProductDetail }) {
    const [active, setActive] = useState<string>(DETAIL_SECTIONS[0].id)

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setActive(entry.target.id)
                }
            },
            { rootMargin: "-10% 0px -70% 0px" },
        )
        for (const { id } of DETAIL_SECTIONS) {
            const el = document.getElementById(id)
            if (el) observer.observe(el)
        }
        return () => observer.disconnect()
    }, [])

    return (
        <>
            {/* 区块导航：对齐天猫 TitleTabs 844×76（上 16 / 内容 48 / 下 12）；sticky 贴住时需要不透明底遮住下滚内容 */}
            <div className="sticky top-0 z-30 bg-canvas pt-4 pb-3">
                <Tabs
                    value={active}
                    onValueChange={(value) => {
                        document
                            .getElementById(value)
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                >
                    <TabsList
                        variant="line"
                        className="min-h-12"
                    >
                        {DETAIL_SECTIONS.map((s) => (
                            <TabsTrigger
                                key={s.id}
                                value={s.id}
                                size="lg"
                            >
                                {s.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            <ReviewsSection />
            <ParamsSection params={detail.params} />
            <DescriptionSection detail={detail} />
        </>
    )
}

/** 用户评价：评价模块后端未建，先占位 */
function ReviewsSection() {
    return (
        <DetailSection
            id="reviews"
            title="用户评价"
        >
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <MessageSquareOff />
                    </EmptyMedia>
                    <EmptyTitle>暂无评价</EmptyTitle>
                    <EmptyDescription>评价功能即将上线</EmptyDescription>
                </EmptyHeader>
            </Empty>
        </DetailSection>
    )
}

/** 参数信息：标签/值行列表（首条做居中摘要卡） */
function ParamsSection({ params }: { params: ProductDetail["params"] }) {
    const [head, ...rest] = params

    return (
        <DetailSection
            id="params"
            title="参数信息"
        >
            {params.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>暂无参数</EmptyTitle>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="space-y-4">
                    {head && (
                        <div className="rounded-xl bg-sunken/50 px-6 py-5 text-center">
                            <p className="text-lg font-bold text-foreground">{head.value}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{head.name}</p>
                        </div>
                    )}
                    <dl className="space-y-3">
                        {rest.map((p) => (
                            <div
                                key={`${p.name}:${p.value}`}
                                className="flex gap-6 text-sm sm:gap-0"
                            >
                                <dt className="shrink-0 text-muted-foreground sm:w-35">{p.name}</dt>
                                <dd className="min-w-0 break-words text-foreground sm:flex-1">
                                    {p.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </DetailSection>
    )
}

/** 图文详情：详情图流纵向铺陈（淘宝式几张图，代替富文本 HTML） */
function DescriptionSection({ detail }: { detail: ProductDetail }) {
    if (detail.detailImages.length === 0) {
        return (
            <DetailSection
                id="detail"
                title="图文详情"
            >
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>暂无图文详情</EmptyTitle>
                        <EmptyDescription>卖家还没有上传商品图文</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </DetailSection>
        )
    }

    return (
        <DetailSection
            id="detail"
            title="图文详情"
        >
            <div className="flex flex-col items-center gap-2">
                {detail.detailImages.map((img) => (
                    <img
                        key={img}
                        src={imgUrl(img)}
                        alt="商品详情图"
                        loading="lazy"
                        className="w-full max-w-2xl rounded-lg object-contain"
                    />
                ))}
            </div>
        </DetailSection>
    )
}

/**
 * 本店推荐：同店铺在售商品（排除当前商品）。
 * 4 列 / 间距 16 / 卡宽 199 → 紧凑卡 199×271，对齐淘宝店铺推荐（左栏 844 铺满）。
 */
export function ShopRecommendSection({ detail }: { detail: ProductDetail }) {
    const query = useQuery(shopProductsOptions(detail.product.shopId))

    return (
        <RecoSection
            id="shop-reco"
            title="本店推荐"
            query={query}
            currentId={detail.product.id}
            className="grid-cols-4"
            variant="compact"
        />
    )
}

/**
 * 看了又看：全站上新流占位（后端推荐接口就绪后替换数据源），排除当前商品。
 * 不局限在左栏——由路由挂成整页宽区块，6 列 / 间距 16 / 卡宽 234.33，对齐淘宝底部推荐流。
 */
export function AlsoViewedSection({ detail }: { detail: ProductDetail }) {
    const query = useQuery(alsoViewedOptions)

    return (
        <RecoSection
            id="also-viewed"
            title="看了又看"
            query={query}
            currentId={detail.product.id}
            className="grid-cols-6"
        />
    )
}
