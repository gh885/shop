import { createRootRouteWithContext, HeadContent, Link, Scripts } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import { buttonVariants, ConfirmDialogHost, Toaster } from "@shop/ui-web"
import { I18nProvider, useI18n } from "@shop/app-kit"
import { localeScope } from "#/shared/lib/locale-scope"

import TanStackQueryDevtools from "#/app/tanstack-query/DevTools"
import TanstackQueryProvider from "#/app/tanstack-query/TanstackQueryProvider"
import { webMessages } from "#/locales"
import { useT } from "#/locales/use-t"
import { BackToTop } from "../layout/BackToTop"
import { RouteProgressBar } from "../layout/RouteProgressBar"
import { LoginDialog } from "#/auth"
import { SiteFooter } from "../layout/SiteFooter"
import { SiteHeader } from "../layout/SiteHeader"
import { bootstrapAuth, useLoginDialogOpen } from "../shared/api/auth"

import appCss from "../styles.css?url"

import type { QueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

interface MyRouterContext {
    queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    head: () => ({
        meta: [
            {
                charSet: "utf-8",
            },
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1",
            },
            {
                title: "Shop - 多店铺电商平台",
            },
            {
                name: "description",
                content: "Shop 多店铺电商平台：免费开店，上架好货，让好生意被更多人看见。",
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
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-24">
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
    const { queryClient } = Route.useRouteContext()
    return (
        <I18nProvider
            resources={webMessages}
            scope={localeScope}
        >
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

/** 全局登录 Dialog（路由守卫也会拉起它） */
function GlobalLoginDialog() {
    const [open, setOpen] = useLoginDialogOpen()

    // 启动时静默刷新登录态（refresh cookie 有效则免登录）
    useEffect(() => {
        void bootstrapAuth()
    }, [])

    return (
        <LoginDialog
            open={open}
            onOpenChange={setOpen}
        />
    )
}
