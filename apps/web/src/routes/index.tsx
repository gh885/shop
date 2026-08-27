import { Suspense } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { Skeleton } from "@shop/ui-web"

import {
    bannersOptions,
    homeNavOptions,
    recommendTabsOptions,
    useBanners,
    useFeedProducts,
    useHomeNav,
    UserCard,
    HomeCategoryNav,
    HomeBannerItem,
    HomeHeader,
    RecommendBar,
} from "#/widgets/home"
import { ProductCard, type Product, type ProductCardData } from "#/entities/product"

export const Route = createFileRoute("/")({
    /**
     * SSR 首屏：只预热「首帧必须有」的轻量数据 —— 导航 / banner / 推荐条词条（都带 5min 缓存，用户感知强，属于壳的一部分）。
     * 商品流 feed 刻意不在这里预热：它最重且无缓存，交给组件侧 useSuspenseQuery + <Suspense> 边界 ——
     * SSR 先吐骨架壳，feed resolve 后经 SSR-query 的 queryStream 流式补发给客户端水合（真正的流式，而不是等全部数据到齐再吐 HTML）。
     * allSettled：单个接口失败不拖垮整页。
     */
    loader: async ({ context }) => {
        await Promise.allSettled([
            context.queryClient.ensureQueryData(homeNavOptions),
            context.queryClient.ensureQueryData(bannersOptions),
            context.queryClient.ensureQueryData(recommendTabsOptions),
        ])
    },
    component: Home,
    head: () => ({
        meta: [
            { title: "Shop - 多店铺电商平台" },
            { property: "og:title", content: "Shop - 多店铺电商平台" },
            { property: "og:type", content: "website" },
            { property: "og:site_name", content: "Shop" },
            {
                name: "description",
                content: "Shop 多店铺电商平台：免费开店，上架好货，让好生意被更多人看见。",
            },
        ],
        links: [{ rel: "canonical", href: "https://shop.example.com/" }],
    }),
})

function toProductCardData(p: Product): ProductCardData {
    return { id: p.id, image: p.image, title: p.title, price: p.priceMin?.amount ?? 0 }
}

/** 首页：五个层级区块，数据各自经 use-home 的 hooks 取（loader 已预热缓存） */
function Home() {
    const feed = useFeedProducts()
    const nav = useHomeNav()
    const banners = useBanners()
    return (
        <>
            <HomeHeader />
            <section className="mx-auto flex max-w-(--container-page) gap-4 px-6 py-6">
                <HomeCategoryNav
                    defaultHeight={200}
                    entries={nav.data}
                />
                {banners.data
                    ? banners.data.slice(0, 3).map((banner) => (
                          <HomeBannerItem
                              key={banner.id}
                              banner={banner}
                          />
                      ))
                    : Array.from({ length: 3 }, (_, i) => (
                          <Skeleton
                              key={i}
                              className="flex-1 h-[200px] rounded-xl"
                          />
                      ))}
                <UserCard />
            </section>
            <RecommendBar />
            {/* 商品流流式边界：loader 未预热，useSuspenseQuery 在此挂起，SSR 吐骨架、resolve 后流式补全 */}
            <Suspense
                fallback={
                    <section className="mx-auto max-w-(--container-page) px-6 py-6">
                        <div className="grid grid-cols-5 gap-3 rounded-xl bg-sunken/50 p-3">
                            {Array.from({ length: 10 }, (_, i) => (
                                <Skeleton
                                    key={i}
                                    className="aspect-square w-full rounded-lg"
                                />
                            ))}
                        </div>
                    </section>
                }
            >
                <section className="mx-auto max-w-(--container-page) px-6 py-6">
                    <div className="grid grid-cols-5 gap-3 rounded-xl bg-sunken/50 p-3">
                        {feed.data.map((product) => (
                            <ProductCard
                                key={product.id}
                                product={toProductCardData(product)}
                            />
                        ))}
                    </div>
                </section>
            </Suspense>
        </>
    )
}
