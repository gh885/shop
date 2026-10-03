import type { ReactElement, ReactNode } from "react"
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider,
} from "@tanstack/react-router"

import { QueryClientProvider } from "@tanstack/react-query"

import { createAppQueryClient } from "../data/query-client"

import { ConfirmDialogHost } from "@shop/ui-web"

import {
    APP_KIT_MESSAGES,
    I18nProvider,
    createLocaleScope,
    type AppLocale,
    type LocaleScope,
} from "../i18n"
import { renderWithProviders as renderWithQuery } from "@shop/test-utils"

/**
 * 三端共享的测试装置（原来各 app 一份 `src/test/render.tsx` 拷贝，同名不同实）。
 *
 * `createAppTestQueryClient`：需要自己持有 client 实例的 hook 测试用（下面两个 render 内部也是它）。
 * 用 `createAppQueryClient` 而不是裸 `createTestQueryClient`：全局 `throwOnError` 与写操作的
 * 全局 toast/失效都挂在这套默认值上，测试里若走裸 client 就永远测不到它们（会变成
 * 「生产里一定发生、测试里从不发生」的盲区）。只把 retry 关掉换确定性，其余照抄生产。
 *
 * `scope` 默认新建一个**没人写入**的持有者，于是它恒为平台默认语言。要测「切语言后的文案」就自己
 * `createLocaleScope(locale)` 传进来，并把**同一个实例**交给 `I18nProvider`：两处不是同一个值时，
 * 界面是 A 语言、toast 是 B 语言。
 */
export function createAppTestQueryClient(scope: LocaleScope = createLocaleScope()) {
    return createAppQueryClient(scope, { queries: { retry: false }, mutations: { retry: false } })
}

/**
 * hook 测试的 wrapper：与生产装配同形（I18nProvider 套 QueryClientProvider，共用一个 scope），
 * 差别只是不在里面渲染组件。app 侧 hook 用 `useI18n()` 取语言，头上没有 Provider
 * 就成了「测试里必炸、生产里必不炸」的那类不对称。
 */
export function createAppTestHookClient(initialLocale: AppLocale = "zh-CN") {
    const scope = createLocaleScope(initialLocale)
    const client = createAppTestQueryClient(scope)
    return {
        client,
        scope,
        wrapper: ({ children }: { children: ReactNode }) => (
            <I18nProvider
                resources={APP_KIT_MESSAGES}
                scope={scope}
                initialLocale={initialLocale}
            >
                <QueryClientProvider client={client}>{children}</QueryClientProvider>
            </I18nProvider>
        ),
    }
}

/**
 * 组件/hook 测试的标准 render：应用真实 QueryClient 默认值 + 全局确认弹窗挂载层
 * （命令式 confirm 的渲染宿主，与生产根布局 <Toaster /> 旁挂法一致）。
 *
 * 一个 scope 同时交给 Provider（写入者）与 QueryClient（读兜底文案），与生产装配同形——
 * 两处各建一个的话，「切语言后的 toast 语言」这件事在测试里就永远对不上生产。
 */
export function renderWithProviders(
    ui: ReactElement,
    {
        queryClient,
        resources = APP_KIT_MESSAGES,
        initialLocale = "zh-CN",
    }: {
        queryClient?: ReturnType<typeof createAppTestQueryClient>
        /** 渲染用的文案资源：默认只有 app-kit 那份。组件用了**本端 catalog** 的 key（如 web.coupon.*）时
         *  必须把本端 resources 传进来（`resources={webMessages}`），否则 `t()` 取不到模板、回落成 key 本身，
         *  表现为「按中文句子找元素找不到」——与生产不一致，且看不出是装配漏了 */
        resources?: import("@shop/common/i18n").I18nResources
        initialLocale?: AppLocale
    } = {},
) {
    const scope = createLocaleScope(initialLocale)
    return renderWithQuery(
        <I18nProvider
            resources={resources}
            scope={scope}
            initialLocale={initialLocale}
        >
            {ui}
            <ConfirmDialogHost />
        </I18nProvider>,
        { queryClient: queryClient ?? createAppTestQueryClient(scope) },
    )
}

/**
 * 需要真实路由上下文的测试（如工作台布局组件）：每次渲染挂一个隔离的 memory-history 路由，
 * 返回 router 供断言导航。QueryClient 同 `renderWithProviders`，用应用真实默认值。
 */
export function renderWithRouter(
    ui: ReactElement,
    {
        initialEntry = "/",
        resources = APP_KIT_MESSAGES,
        initialLocale = "zh-CN",
    }: {
        initialEntry?: string
        resources?: import("@shop/common/i18n").I18nResources
        initialLocale?: import("@shop/common/i18n").AppLocale
    } = {},
) {
    const scope = createLocaleScope(initialLocale)
    const root = createRootRoute({
        component: () => (
            <I18nProvider
                resources={resources}
                scope={scope}
                initialLocale={initialLocale}
            >
                {ui}
                <ConfirmDialogHost />
            </I18nProvider>
        ),
    })
    const index = createRoute({ getParentRoute: () => root, path: "/" })
    const fallback = createRoute({ getParentRoute: () => root, path: "$" })
    const router = createRouter({
        routeTree: root.addChildren([index, fallback]),
        history: createMemoryHistory({ initialEntries: [initialEntry] }),
    })
    const queryClient = createAppTestQueryClient(scope)
    return {
        ...renderWithQuery(<RouterProvider router={router} />, { queryClient }),
        queryClient,
        router,
    }
}
