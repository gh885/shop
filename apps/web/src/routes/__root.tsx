import {
    createRootRouteWithContext,
    HeadContent,
    Link,
    Scripts,
    useRouter,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import { Button, buttonVariants, Toaster } from "@shop/ui-web"

import TanStackQueryDevtools from "#/app/tanstack-query/DevTools"
import TanstackQueryProvider from "#/app/tanstack-query/TanstackQueryProvider"
import { BackToTop } from "../widgets/BackToTop"
import { RouteProgressBar } from "../widgets/RouteProgressBar"
import { LoginDialog } from "#/features/login"
import { SiteFooter } from "../widgets/SiteFooter"
import { SiteHeader } from "../widgets/SiteHeader"
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
    errorComponent: RouteError,
    shellComponent: RootDocument,
})

/** 全局错误边界：路由渲染抛错时给友好错误页 + 重试，避免白屏 */
function RouteError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-24">
            <p className="text-sm font-medium text-destructive">出错了</p>
            <h1 className="text-3xl font-bold tracking-tight">页面暂时无法加载</h1>
            <p className="text-muted-foreground">{error.message || "发生了意外错误，请重试。"}</p>
            <div className="flex gap-2">
                <Button
                    onClick={() => {
                        reset()
                    }}
                >
                    重试
                </Button>
                <Button
                    variant="outline"
                    render={<Link to="/" />}
                >
                    回到首页
                </Button>
            </div>
        </div>
    )
}

/** 品牌化的 404：给出回首页的出口，不做死胡同 */
function NotFound() {
    return (
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-24">
            <p className="text-sm font-medium text-muted-foreground">404</p>
            <h1 className="text-3xl font-bold tracking-tight">页面不存在或已下线</h1>
            <p className="text-muted-foreground">你找的页面不在这里，回首页继续逛吧。</p>
            <Link
                to="/"
                className={buttonVariants()}
            >
                回到首页
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
    const router = useRouter()
    const { queryClient } = router.options.context
    return (
        <html lang="zh-CN">
            <head>
                <HeadContent />
            </head>
            <body className="flex min-h-screen flex-col supports-[height:100dvh]:min-h-dvh">
                <Toaster />
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
