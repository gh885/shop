import { useEffect } from 'react';
import { HeadContent, Link, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';

import { Button } from '@shop/ui-web';

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools';
import { LoginDialog } from '../components/login-dialog';
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
        ],
        links: [
            {
                rel: 'stylesheet',
                href: appCss,
            },
        ],
    }),
    shellComponent: RootDocument,
});

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
            <body>
                <Header />
                <main>{children}</main>
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
        <header className="border-b">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                <Link
                    to="/"
                    className="text-lg font-bold tracking-tight"
                >
                    Shop
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                        多店铺电商平台
                    </span>
                </Link>

                <div className="flex items-center gap-3">
                    <Link
                        to="/sell"
                        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        我要开店
                    </Link>
                    {status === 'unknown' ? (
                        <span className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
                    ) : status === 'authed' ? (
                        <>
                            <Link
                                to="/shops/mine"
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                                我的店铺
                            </Link>
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
