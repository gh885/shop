import { useLayoutEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react"

import { Button } from "@shop/ui-web"

import { Sticky } from "../shared/ui/sticky"
import { HomeCategoryNav } from "#/features/home/home-category-nav"
import { UserCard } from "#/features/home/user-card"
import { ProductCard, type ProductCardData } from "#/features/home/product-card"

/** 第一层顶栏高度（px）。第五层吸顶时以此为 top 偏移。 */
export const HOME_HEADER_HEIGHT = 64

export const Route = createFileRoute("/")({
    component: Home,
    head: () => ({
        meta: [{ title: "Shop - 多店铺电商平台" }],
    }),
})

function Home() {
    return (
        <div>
            <HomeHeader />
            <CategoryCards />
            <RecommendBar />
            <ProductGrid />
        </div>
    )
}

/** 第四层：吸顶推荐条，吸在顶栏下方。扁平数组（猜你喜欢是普通一项），每页显示数量由容器宽度自动决定，首末页隐藏对应翻页按钮 */
const RECOMMEND_ITEMS = [
    "猜你喜欢",
    "运动户外",
    "食品生鲜",
    "日用百货",
    "服饰时尚",
    "3C数码",
    "智能家电",
    "家用电器",
    "珠宝饰品",
    "玩具潮玩",
    "鲜花园艺",
    "数字生活",
    "家装建材",
    "办公文教",
    "手机",
    "笔记本",
    "空调",
    "冰箱",
    "洗衣机",
    "耳机",
    "智能手表",
    "扫地机器人",
    "+更多",
]

function RecommendBar() {
    const [page, setPage] = useState(0)

    // 测量一页能放多少个词：测量层与显示层同宽、单行，累计宽度（含 gap）直到放不下
    const measureRef = useRef<HTMLDivElement>(null)
    const [pageSize, setPageSize] = useState(0)

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

    const totalPages = Math.max(1, Math.ceil(RECOMMEND_ITEMS.length / pageSize))
    const clampedPage = Math.min(page, totalPages - 1)
    const visible = RECOMMEND_ITEMS.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)

    const prevPage = () => setPage((p) => Math.max(0, p - 1))
    const nextPage = () => setPage((p) => Math.min(totalPages - 1, p + 1))
    const refresh = () => setPage(0)

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
                            {RECOMMEND_ITEMS.map((tab) => (
                                <span
                                    key={tab}
                                    className="shrink-0 whitespace-nowrap text-base"
                                >
                                    {tab}
                                </span>
                            ))}
                        </div>
                        {/* 当前页可见项 */}
                        {visible.map((tab, i) => (
                            <button
                                key={tab}
                                type="button"
                                className={`shrink-0 whitespace-nowrap text-base transition-colors ${
                                    clampedPage === 0 && i === 0
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

/** 第五层：商品卡片网格（mock 数据，接后端后替换数据源） */
const MOCK_PRODUCTS: ProductCardData[] = [
    {
        title: "索尼（SONY）WH-1000XM5 头戴式无线降噪耳机 深夜黑",
        price: 199900,
        sales: "已售 8.2万",
        tags: ["自营", "放心购"],
        shop: "索尼京东自营旗舰店",
    },
    {
        title: "澳佳宝（Blackmores）深海鱼油胶囊 1000mg 400粒 中老年保健",
        price: 13900,
        sales: "已售 100万+",
        tags: ["自营", "满299减30"],
        shop: "澳佳宝海外自营",
    },
    {
        title: "狼蛛（AULA）SC580EVO 双8K无线鼠标 电竞游戏专用",
        price: 11850,
        sales: "已售 2万+",
        tags: ["自营", "超级补贴"],
        shop: "狼蛛官方旗舰店",
    },
    {
        title: "雷蛇（Razer）毒蝰V4pro专业版 轻量化无线游戏鼠标",
        price: 31900,
        sales: "已售 5.3万",
        tags: ["自营", "价保30天"],
        shop: "雷蛇京东自营",
    },
    {
        title: "美的（Midea）1.5匹变频空调挂机 新一级能效 省电星",
        price: 249900,
        sales: "已售 36万+",
        tags: ["自营", "以旧换新"],
        shop: "美的京东自营旗舰店",
    },
    {
        title: "三只松鼠 每日坚果 750g/30袋 混合干果礼盒装",
        price: 7990,
        sales: "已售 200万+",
        tags: ["自营", "放心购"],
        shop: "三只松鼠旗舰店",
    },
    {
        title: "Apple iPhone 16 Pro 256GB 原色钛金属 支持移动联通电信5G",
        price: 899900,
        sales: "已售 12万+",
        tags: ["自营", "正品行货"],
        shop: "Apple产品京东自营",
    },
    {
        title: "小林制药（KOBAYASHI）运动鞋除菌消臭喷雾 250ml 日本进口",
        price: 2890,
        sales: "已售 60万+",
        tags: ["国际", "首购礼金2元"],
        shop: "小林制药海外店",
    },
    {
        title: "联想拯救者 300W 氮化镓适配器 笔记本快充 原装正品",
        price: 35910,
        sales: "已售 20万+",
        tags: ["自营", "只换不修"],
        shop: "联想京东自营",
    },
    {
        title: "金达日美指甲刀套装 甲沟炎专用 修脚工具 不锈钢",
        price: 1740,
        sales: "已售 100万+",
        tags: ["自营", "工厂榜第2名"],
        shop: "金达日美旗舰店",
    },
    {
        title: "惠普战99 台式电脑一体机 14代酷睿 办公家用整机",
        price: 748900,
        sales: "已售 700+",
        tags: ["自营", "免息分期"],
        shop: "惠普京东自营",
    },
    {
        title: "范泳辰（fanyongchen）男士控油蓬松洗发水 500ml 留香去屑",
        price: 3590,
        sales: "已售 40万+",
        tags: ["自营", "放心购"],
        shop: "范泳辰旗舰店",
    },
].map((p, i) => ({
    ...p,
    id: `p-${i}`,
    image: `https://picsum.photos/seed/product-${i}/400/400`,
}))

function ProductGrid() {
    return (
        <section className="mx-auto max-w-[1400px] px-6 py-6">
            <div className="grid grid-cols-5 gap-3 rounded-xl bg-sunken/50 p-3">
                {MOCK_PRODUCTS.map((product) => (
                    <ProductCard
                        key={product.id}
                        product={product}
                    />
                ))}
            </div>
        </section>
    )
}

/** 第二层：左侧分类导航 + 中间三个运营位 + 最右用户卡片 */
const PROMO_CARDS = [
    { title: "家电焕新季", subtitle: "以旧换新 至高补贴 20%", seed: "promo-appliance" },
    { title: "超市囤货节", subtitle: "满 199 减 100 限时抢", seed: "promo-grocery" },
    { title: "新品首发", subtitle: "数码潮玩 抢先体验", seed: "promo-digital" },
]

function CategoryCards() {
    return (
        <section className="mx-auto max-w-[1400px] px-6 py-6">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_250px] gap-4">
                <HomeCategoryNav defaultHeight={200} />
                {PROMO_CARDS.map((card) => (
                    <button
                        key={card.seed}
                        type="button"
                        className="group relative h-[200px] overflow-hidden rounded-xl text-left"
                    >
                        <img
                            src={`https://picsum.photos/seed/${card.seed}/480/240`}
                            alt={card.title}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-4">
                            <div className="text-base font-bold text-white">{card.title}</div>
                            <div className="mt-0.5 text-xs text-white/80">{card.subtitle}</div>
                        </div>
                    </button>
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
