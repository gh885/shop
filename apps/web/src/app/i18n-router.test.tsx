import { createLocaleRewrite } from "#/shared/lib/locale-url"
import { message } from "#/locales/message"
import {
    createMemoryHistory,
    createRootRouteWithContext,
    createRoute,
    createRouter,
    HeadContent,
    Outlet,
    RouterProvider,
} from "@tanstack/react-router"
import { QueryClientProvider, useMutation } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vite-plus/test"
import { http, HttpResponse } from "msw"
import { AddressesApi } from "@shop/api/sdk"
import { server } from "@shop/test-utils"
import { I18nProvider, useI18n } from "@shop/app-kit/i18n"
import { createAppQueryClient } from "@shop/app-kit/data"
import { Toaster } from "@shop/ui-web"
import { localeOf, type AppLocale } from "@shop/i18n"
import { translateWeb } from "#/locales"
import { getBrowserI18n } from "#/shared/lib/i18n"
import { bindRouterI18n } from "./i18n-router"

// Vitest 不跑 Start 的客户端变换；只替换框架分支选择，SDK/Router/i18next 均用真实实现。
vi.mock("@tanstack/react-start", () => ({
    createIsomorphicFn: () => ({ server: () => ({ client: <T,>(fn: T) => fn }) }),
}))
// oxlint-disable-next-line import/no-unassigned-import -- 用真实 web SDK 请求头装配，MSW 只拦网络
import "#/shared/api/client"

function Page() {
    const { t, setLocale } = useI18n()
    const mutation = useMutation({
        mutationFn: () => AddressesApi.listAddresses(),
        meta: { success: message("confirm.confirm") },
    })
    return (
        <>
            <h1>{t("app.title")}</h1>
            <input
                aria-label="draft"
                defaultValue="未保存内容"
            />
            <button
                onClick={() => {
                    setLocale("en-US")
                    mutation.mutate()
                }}
            >
                switch-and-request
            </button>
        </>
    )
}

describe("language switch across React / Router / SDK / MutationCache", () => {
    it("updates title, immediate request headers and next toast without losing the draft", async () => {
        document.documentElement.lang = "zh-Hans-CN"
        const i18n = getBrowserI18n()
        await i18n.changeLanguage("zh-Hans-CN")
        const requests: Array<{ locale: string | null; explicit: string | null }> = []
        server.use(
            http.get("*/user/addresses", ({ request }) => {
                requests.push({
                    locale: request.headers.get("accept-language"),
                    explicit: request.headers.get("x-locale"),
                })
                return HttpResponse.json([])
            }),
        )
        const root = createRootRouteWithContext<{ locale: AppLocale }>()({
            component: () => (
                <>
                    <HeadContent />
                    <Outlet />
                </>
            ),
        })
        const page = createRoute({
            getParentRoute: () => root,
            path: "/",
            component: Page,
            head: ({ match }) => ({
                meta: [{ title: translateWeb("route.title.search", match.context.locale) }],
            }),
        })
        const router = createRouter({
            routeTree: root.addChildren([page]),
            history: createMemoryHistory({ initialEntries: ["/zh-Hans-CN/?keep=1#draft"] }),
            origin: "http://localhost",
            rewrite: createLocaleRewrite(localeOf(i18n), "http://localhost"),
            context: { locale: localeOf(i18n) },
        })
        const unbind = bindRouterI18n(router, i18n)
        const queryClient = createAppQueryClient(i18n)
        await router.load()
        const view = render(
            <I18nProvider i18n={i18n}>
                <QueryClientProvider client={queryClient}>
                    <RouterProvider router={router} />
                    <Toaster />
                </QueryClientProvider>
            </I18nProvider>,
        )
        try {
            await screen.findByRole("button", { name: "switch-and-request" })
            fireEvent.change(screen.getByLabelText("draft"), { target: { value: "edited" } })
            fireEvent.click(screen.getByRole("button", { name: "switch-and-request" }))
            expect(router.history.location.href).toBe("/en-US/?keep=1#draft")
            expect(i18n.language).toBe("en-US")
            expect(document.documentElement.lang).toBe("en-US")
            expect(document.cookie).toContain("locale=en-US")
            await waitFor(() => expect(document.title).toBe("Search - Shop"))
            expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
                "Shop - Multi-store E-commerce Platform",
            )
            await screen.findByText("Confirm")
            expect(requests).toEqual([{ locale: "en-US", explicit: "en-US" }])
            expect(screen.getByLabelText("draft")).toHaveValue("edited")
            await act(async () => {
                await i18n.changeLanguage("zh-Hans-CN")
            })
            await waitFor(() =>
                expect(document.title).toBe(translateWeb("route.title.search", "zh-Hans-CN")),
            )
        } finally {
            view.unmount()
            unbind()
            queryClient.clear()
        }
    })
})
