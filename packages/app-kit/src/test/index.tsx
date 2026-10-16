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
import { bindNotifyI18n } from "../data/notify"

import { ConfirmDialogHost } from "@shop/ui-web"

import {
    APP_KIT_MESSAGES,
    I18nProvider,
    createAppI18n,
    type AppLocale,
    type I18nInstance,
} from "../i18n"
import { renderWithProviders as renderWithQuery } from "@shop/test-utils"

/**
 * 用 createAppQueryClient 而非裸 createTestQueryClient：全局 throwOnError 与写操作 toast/失效都挂在这套默认值上，裸 client 测不到它们会变成「生产必发生、测试从不」盲区；只关 retry 换确定性，其余照抄生产。
 * i18next 与生产一样由 Provider 和 QueryClient 共享，缺省建平台默认语言实例。
 */
export function createAppTestQueryClient(i18n: I18nInstance = createAppI18n()) {
    // 与生产同形绑 i18n，notify 的 { key } 文案才能按渲染实例现取语言（裸 key 不再泄漏到断言）
    bindNotifyI18n(i18n)
    return createAppQueryClient(i18n, { queries: { retry: false }, mutations: { retry: false } })
}

/** hook 测试 wrapper：与生产同形（I18nProvider 套 QueryClientProvider、共用一个 i18n），只是不渲染组件；缺 Provider 就成了「测试必炸、生产必不炸」那类不对称 */
export function createAppTestHookClient(initialLocale: AppLocale = "zh-Hans-CN") {
    const i18n = createAppI18n(initialLocale)
    const client = createAppTestQueryClient(i18n)
    return {
        client,
        i18n,
        wrapper: ({ children }: { children: ReactNode }) => (
            <I18nProvider i18n={i18n}>
                <QueryClientProvider client={client}>{children}</QueryClientProvider>
            </I18nProvider>
        ),
    }
}

/**
 * 组件/hook 测试标准 render：真实 QueryClient 默认值 + 确认弹窗挂载层（命令式 confirm 宿主，与生产 <Toaster /> 旁挂一致）
 * 一个 i18n 同时交 Provider（写入）与 QueryClient（读兜底文案）与生产同形；两处各建一个则「切语言后 toast 语言」永远对不上生产
 */
export function renderWithProviders(
    ui: ReactElement,
    {
        queryClient,
        resources = APP_KIT_MESSAGES,
        initialLocale = "zh-Hans-CN",
    }: {
        queryClient?: ReturnType<typeof createAppTestQueryClient>
        /** 默认只有 app-kit 那份；组件用了本端 catalog 的 key（如 web.coupon.*）时必须传进来，否则 t() 回落成 key 本身、按中文句子找不到元素，看不出是装配漏了 */
        resources?: import("@shop/i18n").I18nResources
        initialLocale?: AppLocale
    } = {},
) {
    const i18n = createAppI18n(initialLocale, resources)
    return renderWithQuery(
        <I18nProvider i18n={i18n}>
            {ui}
            <ConfirmDialogHost />
        </I18nProvider>,
        { queryClient: queryClient ?? createAppTestQueryClient(i18n) },
    )
}

/** 需要真实路由上下文的测试（如工作台布局）：每次渲染挂隔离 memory-history 路由，返回 router 供断言导航；QueryClient 同 renderWithProviders */
export function renderWithRouter(
    ui: ReactElement,
    {
        initialEntry = "/",
        resources = APP_KIT_MESSAGES,
        initialLocale = "zh-Hans-CN",
    }: {
        initialEntry?: string
        resources?: import("@shop/i18n").I18nResources
        initialLocale?: import("@shop/i18n").AppLocale
    } = {},
) {
    const i18n = createAppI18n(initialLocale, resources)
    const root = createRootRoute({
        component: () => (
            <I18nProvider i18n={i18n}>
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
    const queryClient = createAppTestQueryClient(i18n)
    return {
        ...renderWithQuery(<RouterProvider router={router} />, { queryClient }),
        queryClient,
        router,
    }
}
