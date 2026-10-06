import { createRootRouteWithContext, HeadContent, Link, Scripts } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import { buttonVariants, ConfirmDialogHost, Toaster } from "@shop/ui-web"
import { I18nProvider, useI18n } from "@shop/app-kit/i18n"
import TanStackQueryDevtools from "#/app/tanstack-query/DevTools"
import TanstackQueryProvider from "#/app/tanstack-query/TanstackQueryProvider"
import { useT } from "#/locales/use-t"
import { translateWeb } from "#/locales"
import { BackToTop } from "../layout/BackToTop"
import { RouteProgressBar } from "../layout/RouteProgressBar"
import { SiteFooter } from "../layout/SiteFooter"
import { SiteHeader } from "../layout/SiteHeader"
import { bootstrapAuth, useLoginDialogOpen } from "../shared/api/auth"
import { useWebMonitoring } from "../shared/lib/monitoring"

import appCss from "../styles.css?url"

import type { QueryClient } from "@tanstack/react-query"
import type { AppLocale, I18nInstance } from "@shop/app-kit/i18n"
import { lazy, Suspense, useEffect, useState } from "react"

interface MyRouterContext {
    queryClient: QueryClient
    /** Router 的语言快照：SSR 按请求解析，客户端由 i18next languageChanged 同步更新。 */
    locale?: AppLocale
    i18n: I18nInstance
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    head: ({ match }) => ({
        meta: [
            { title: translateWeb("app.title", match.context.locale) },
            { name: "description", content: translateWeb("app.description", match.context.locale) },
            {
                charSet: "utf-8",
            },
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1",
            },
        ],
        links: [
            {
                rel: "stylesheet",
                href: appCss,
            },
        ],
    }),
    notFoundComponent: NotFound,
    shellComponent: RootDocument,
})

/** 品牌化的 404：给出回首页的出口，不做死胡同 */
function NotFound() {
    const t = useT()
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-24">
            <p className="text-sm font-medium text-muted-foreground">404</p>
            <h1 className="text-3xl font-bold">{t("common.notFound.title")}</h1>
            <p className="text-muted-foreground">{t("common.notFound.description")}</p>
            <Link
                to="/"
                className={buttonVariants()}
            >
                {t("common.action.backHome")}
            </Link>
        </div>
    )
}

const devtoolsConfig = { position: "bottom-right" as const }
const devtoolsPlugins = [
    {
        name: "Tanstack Router",
        render: <TanStackRouterDevtoolsPanel />,
    },
    TanStackQueryDevtools,
]

function RootDocument({ children }: { children: React.ReactNode }) {
    const { queryClient, i18n } = Route.useRouteContext()
    return (
        <I18nProvider i18n={i18n}>
            <DocumentShell queryClient={queryClient}>{children}</DocumentShell>
        </I18nProvider>
    )
}

function DocumentShell({
    queryClient,
    children,
}: {
    queryClient: QueryClient
    children: React.ReactNode
}) {
    const { locale } = useI18n()
    // 监控：客户端装配（启全局监听、量 Web Vitals、PV）。SSR 侧不跑，详见 monitoring.ts 文件头
    useWebMonitoring()
    return (
        <html lang={locale}>
            <head>
                <HeadContent />
            </head>
            <body className="flex min-h-screen flex-col supports-[height:100dvh]:min-h-dvh">
                <Toaster />
                <ConfirmDialogHost />
                <RouteProgressBar />
                <TanstackQueryProvider queryClient={queryClient}>
                    <SiteHeader />
                    <main className="flex flex-1 flex-col">{children}</main>
                    <SiteFooter />
                    <BackToTop />
                    <GlobalLoginDialog />
                </TanstackQueryProvider>
                <TanStackDevtools
                    config={devtoolsConfig}
                    plugins={devtoolsPlugins}
                />
                <Scripts />
            </body>
        </html>
    )
}

/**
 * 全局登录 Dialog。弹窗本体走 lazy：它把 app-kit 的 LoginForm → ui-web 的 PhoneField →
 * `react-phone-number-input/min` 整条链拖进来，libphonenumber 的号码元数据单 `metadata.min.json`
 * 一项就 24KB gzip，而那是**点「登录」之后**才需要的代码（用 `pnpm perf:attrib web` 的 network
 * 报告查看依赖路径）。静态 import 时 TanStack Start 会把它列进每个页面的
 * `<link rel=modulepreload>`，等于让落地页和商详也下一遍。
 *
 * 「首次打开才挂载、之后一直挂着」：不打开就零成本；关闭的退场动画需要组件在场，每次开关都卸载会让动画直接消失。
 *
 * `bootstrapAuth()` 留在壳里同步跑——首屏就要做（用 httpOnly refresh cookie 换回内存里的 access
 * token，决定页头登录态），它不碰 LoginForm 那条重链。
 */
const LazyLoginDialog = lazy(() =>
    import("#/auth/LoginDialog").then((module) => ({ default: module.LoginDialog })),
)

function GlobalLoginDialog() {
    const [open, setOpen] = useLoginDialogOpen()
    const [keepMounted, setKeepMounted] = useState(open)

    // 渲染期把「打开过」记下来（React 对「随 prop 调整 state」的推荐写法）：
    // 放进 useEffect 会多排一次渲染，而这里要的只是首次打开之后不再卸载
    if (open && !keepMounted) setKeepMounted(true)

    useEffect(() => {
        void bootstrapAuth()
    }, [])

    if (!keepMounted) return null

    return (
        <Suspense fallback={null}>
            <LazyLoginDialog
                open={open}
                onOpenChange={setOpen}
            />
        </Suspense>
    )
}
