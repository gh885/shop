import { useEffect } from 'react';
import { HeadContent, Link, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';

import { Button, buttonVariants } from '@shop/ui-web';

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools';
import { LoginDialog } from '../components/login-dialog';
import { SiteFooter } from '../components/site-footer';
import { SiteNav } from '../components/site-nav';
import { bootstrapAuth, logout } from '../lib/api';
import { useAuthStatus, useLoginDialogOpen } from '../lib/auth';
import { useClearMe, useMe } from '../lib/me';

import appCss from '../styles.css?url';

import type { QueryClient } from '@tanstack/react-query';

interface MyRouterContext {
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    head: () => ({
        meta: [
            {
                charSet: 'utf-8',
            },
            {
                name: 'viewport',
                content: 'width=device-width, initial-scale=1',
            },
            {
                title: 'Shop - 多店铺电商平台',
            },
            {
                name: 'description',
                content: 'Shop 多店铺电商平台：免费开店，上架好货，让好生意被更多人看见。',
            },
        ],
        links: [
            {
                rel: 'stylesheet',
                href: appCss,
            },
        ],
    }),
    notFoundComponent: NotFound,
    shellComponent: RootDocument,
});

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
    );
}

const devtoolsConfig = { position: 'bottom-right' as const };
const devtoolsPlugins = [
    {
        name: 'Tanstack Router',
        render: <TanStackRouterDevtoolsPanel />,
    },
    TanStackQueryDevtools,
];

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-CN">
            <head>
                <HeadContent />
            </head>
            <body className="flex min-h-dvh flex-col">
                <Header />
                <main className="flex-1">{children}</main>
                <SiteFooter />
                <GlobalLoginDialog />
                <TanStackDevtools
                    config={devtoolsConfig}
                    plugins={devtoolsPlugins}
                />
                <Scripts />
            </body>
        </html>
    );
}

function Header() {
    const status = useAuthStatus();
    const [, setLoginOpen] = useLoginDialogOpen();
    const me = useMe();
    const clearMe = useClearMe();

    async function handleLogout() {
        await logout();
        clearMe();
    }

    return (
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
                <Link
                    to="/"
                    className="text-lg font-bold tracking-tight"
                >
                    Shop
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                        多店铺电商平台
                    </span>
                </Link>

                <SiteNav />

                <div className="ml-auto flex items-center gap-3">
                    {status === 'unknown' ? (
                        <span className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
                    ) : status === 'authed' ? (
                        <>
                            <span className="text-sm text-muted-foreground">
                                {me.data?.nickname ?? me.data?.phone ?? '…'}
                            </span>
                            <Button
                                variant="outline"
                                onClick={handleLogout}
                            >
                                退出登录
                            </Button>
                        </>
                    ) : (
                        <Button onClick={() => setLoginOpen(true)}>登录</Button>
                    )}
                </div>
            </div>
        </header>
    );
}

/** 全局登录 Dialog（路由守卫也会拉起它） */
function GlobalLoginDialog() {
    const [open, setOpen] = useLoginDialogOpen();

    // 启动时静默刷新登录态（refresh cookie 有效则免登录）
    useEffect(() => {
        void bootstrapAuth();
    }, []);

    return (
        <LoginDialog
            open={open}
            onOpenChange={setOpen}
        />
    );
}
