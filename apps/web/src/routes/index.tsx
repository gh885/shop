import { createFileRoute } from "@tanstack/react-router"
import { translateWeb } from "#/locales"

import {
    bannersOptions,
    Feed,
    homeNavOptions,
    recommendTabsOptions,
    UserCard,
    HomeBanners,
    HomeCategoryNav,
    HomeHeader,
    HomeSkeleton,
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
    /**
     * 路由级挂起骨架：盖住上面 loader 的预取窗口（SSR 首屏 + 客户端导航）。
     * 库的默认行为是渲染 null（详见 `@tanstack/react-router` 的 renderPending），
     * 没有这一层时冷缓存首屏会在预取期间空白；各区块自己的 QueryBoundary pending
     * 只覆盖「loader 已过、某区块仍在取数」的更细窗口，两者互补。
     */
    pendingComponent: HomeSkeleton,
    component: Home,
    head: ({ match }) => {
        // 绝对 URL 一律用 SITE_ORIGIN 拼：写死域名会让 staging/preview 把错误域名烤进 HTML
        const canonical = `${SITE_ORIGIN}${match.pathname}`
        return {
            meta: [
                { title: translateWeb("app.title", match.context.locale) },
                { property: "og:title", content: translateWeb("app.title", match.context.locale) },
                { property: "og:type", content: "website" },
                { property: "og:site_name", content: "Shop" },
                { property: "og:url", content: canonical },
                {
                    name: "description",
                    content: translateWeb("app.description", match.context.locale),
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
 * 路由文件不承载业务状态（否则它会被撑成第二个页面文件）。导航与 banner 的取数与三态也在各区块
 * 自己手里（QueryBoundary），路由只负责预热。
 */
function Home() {
    return (
        <>
            <HomeHeader />
            {/* 首屏：分类导航 / banner / 用户卡落在**同一张**白卡（home-module）里，
                但两侧列各自带浅灰底（`home-rail`）读成"轨"、中间 banner 区留白，
                三块之间是 16px 的 gap（与 banner 卡间距同档），不再是发丝线——
                层次靠白与浅灰的底色差，这是淘宝实测的主导规则。
                刻意不设 overflow-hidden：分类导航 hover 的竖展容器要能超出面板下沿
                （mega 面板走 base-ui 的 createPortal，不受裁剪；竖展容器靠自身浅灰底读成一层）。
                同样刻意**不设任何创建层叠上下文的属性**（isolate / transform / filter / opacity<1 / z-*）：
                竖展容器要靠"祖先链干净"才能压住下方的推荐条，加了就被盖住且是静默的。
                推理链与 dev 自检见 `home/HomeCategoryNav.tsx`。 */}
            <section className="mx-auto w-full max-w-page px-6 py-6">
                <div className="home-module flex flex-col gap-4 lg:flex-row">
                    <HomeCategoryNav />
                    <HomeBanners />
                    <div className="hidden shrink-0 lg:block">
                        <UserCard />
                    </div>
                </div>
            </section>
            <Feed />
        </>
    )
}
