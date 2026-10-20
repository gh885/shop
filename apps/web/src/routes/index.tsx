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
} from "#/domains/home"
import { SITE_ORIGIN } from "#/shared/lib/env"

export const Route = createFileRoute("/")({
    loader: async ({ context }) => {
        await Promise.allSettled([
            context.queryClient.query({ ...homeNavOptions, staleTime: "static" }),
            context.queryClient.query({ ...bannersOptions, staleTime: "static" }),
            context.queryClient.query({ ...recommendTabsOptions, staleTime: "static" }),
        ])
    },
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
