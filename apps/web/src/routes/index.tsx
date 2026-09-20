import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { Skeleton } from "@shop/ui-web"

import {
    bannersOptions,
    Feed,
    homeNavOptions,
    recommendTabsOptions,
    UserCard,
    HomeCategoryNav,
    HomeBannerItem,
    HomeHeader,
} from "#/home"
import { SITE_ORIGIN } from "#/shared/lib/env"

export const Route = createFileRoute("/")({
    /**
     * SSR 首屏：只预热「首帧必须有」的轻量数据 —— 导航 / banner / 推荐条词条（都带 5min 缓存，用户感知强，属于壳的一部分）。
     * 商品流 feed 刻意不在这里预热：它最重且无缓存，交给 `home/Feed` 自己的 QueryBoundary ——
     * SSR 先吐骨架壳，feed resolve 后经 SSR-query 的 queryStream 流式补发给客户端水合（真正的流式，而不是等全部数据到齐再吐 HTML）。
     * allSettled：单个接口失败不拖垮整页。
     */
    loader: async ({ context }) => {
        await Promise.allSettled([
            context.queryClient.query({ ...homeNavOptions, staleTime: "static" }),
            context.queryClient.query({ ...bannersOptions, staleTime: "static" }),
            context.queryClient.query({ ...recommendTabsOptions, staleTime: "static" }),
        ])
    },
    component: Home,
    head: ({ match }) => {
        // 绝对 URL 一律用 SITE_ORIGIN 拼：写死域名会让 staging/preview 把错误域名烤进 HTML
        const canonical = `${SITE_ORIGIN}${match.pathname}`
        return {
            meta: [
                { title: "Shop - 多店铺电商平台" },
                { property: "og:title", content: "Shop - 多店铺电商平台" },
                { property: "og:type", content: "website" },
                { property: "og:site_name", content: "Shop" },
                { property: "og:url", content: canonical },
                {
                    name: "description",
                    content: "Shop 多店铺电商平台：免费开店，上架好货，让好生意被更多人看见。",
                },
            ],
            links: [{ rel: "canonical", href: canonical }],
        }
    },
})

/**
 * 首页：壳区块与商品流。
 *
 * 这里只留布局与区块顺序：推荐条 + 商品流（tab、无限滚动、哨兵、尾部四态）整体归 `#/home` 的 Feed，
 * 路由文件不承载业务状态（否则它会被撑成第二个页面文件）。
 */
function Home() {
    const nav = useQuery(homeNavOptions)
    const banners = useQuery(bannersOptions)
    // 区块降级口径（见 home/queries.ts）：失败且无缓存 → 当「读不到」，不画 / 走空态；有旧数据照常渲染。
    // 不能只看 isError：后台刷新失败时 isError 为真但 data 还在，清空等于把能看的内容换成骨架。
    // 空数组是「明确的空态」而不是加载中——这正是子组件区分 undefined 与 [] 的用意。
    const navEntries = nav.data ?? (nav.isError ? [] : undefined)
    const bannerList = banners.data ?? (banners.isError ? [] : undefined)
    return (
        <>
            <HomeHeader />
            <section className="mx-auto flex max-w-page flex-col gap-4 px-6 py-6 lg:flex-row">
                <HomeCategoryNav
                    defaultHeight={200}
                    entries={navEntries}
                />
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {bannerList
                        ? bannerList.slice(0, 3).map((banner) => (
                              <HomeBannerItem
                                  key={banner.id}
                                  banner={banner}
                              />
                          ))
                        : Array.from({ length: 3 }, (_, i) => (
                              <Skeleton
                                  key={i}
                                  className="h-50 rounded-xl"
                              />
                          ))}
                </div>
                <div className="hidden shrink-0 lg:block">
                    <UserCard />
                </div>
            </section>
            <Feed />
        </>
    )
}
