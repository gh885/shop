import { createFileRoute } from "@tanstack/react-router"

import {
    bannersOptions,
    feedOptions,
    homeNavOptions,
    recommendTabsOptions,
} from "#/features/home/use-home"
import { CategoryCards } from "#/widgets/home/category-cards"
import { HomeHeader } from "#/widgets/home/home-header"
import { ProductGrid } from "#/widgets/home/product-grid"
import { RecommendBar } from "#/widgets/home/recommend-bar"

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

/** 首页：五个层级区块，数据各自经 use-home 的 hooks 取（loader 已预热缓存） */
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
