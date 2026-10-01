import { Outlet } from "@tanstack/react-router"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import type { FeedItemResponse } from "@shop/api/sdk"
import { makeRecommendTab as makeTab, apiProblem, server } from "@shop/test-utils"

import { renderWithRouter } from "@shop/app-kit/test"

import { Feed } from "./Feed"

/**
 * 首页商品流：钉住无限滚动的三件容易回归的事 ——
 * 1. 哨兵进视口要追加下一页，且已加载页不丢；
 * 2. 追加页失败就地重试（保留第一页），不整块换成错误态；
 * 3. 「换一批」丢页重拉（无游标 → 新种子），而不是把已加载页串行重拉。
 *
 * 卡片里有指向 /products/$id 的 Link，使用共享内存路由装置承接真实导航。
 * jsdom 没有 IntersectionObserver / ResizeObserver，这里补最小实现（补浏览器 API，不 mock 业务模块）。
 */

const CATEGORY_ID = "01900000-0000-7000-8000-000000000301"

class TestIntersectionObserver implements IntersectionObserver {
    static instances: TestIntersectionObserver[] = []

    readonly root: Element | Document | null = null
    readonly rootMargin: string = ""
    readonly scrollMargin: string = ""
    readonly thresholds: ReadonlyArray<number> = []

    private readonly callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
        TestIntersectionObserver.instances.push(this)
    }

    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
        return []
    }

    /** 模拟「哨兵滚进视口」触发一次回调 */
    enter() {
        this.callback(
            [
                {
                    isIntersecting: true,
                    boundingClientRect: new DOMRectReadOnly(),
                    intersectionRatio: 1,
                    intersectionRect: new DOMRectReadOnly(),
                    rootBounds: null,
                    target: document.body,
                    time: 0,
                },
            ],
            this,
        )
    }
}

beforeEach(() => {
    TestIntersectionObserver.instances = []
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

/** 标签 → 合法 UUID：生成的 zod 契约会校验 wire 形状，`id: "1"` 这种会被拦成「响应数据不符合接口契约」 */
const ITEM_IDS = {
    "1": "01900000-0000-7000-8000-000000000001",
    "2": "01900000-0000-7000-8000-000000000002",
    "3": "01900000-0000-7000-8000-000000000003",
    all: "01900000-0000-7000-8000-00000000000a",
    cat: "01900000-0000-7000-8000-00000000000c",
}

function makeItem(label: keyof typeof ITEM_IDS): FeedItemResponse {
    return {
        id: ITEM_IDS[label],
        shopId: "00000000-0000-4000-8000-0000000000a1",
        categoryId: CATEGORY_ID,
        name: `商品 ${label}`,
        subtitle: null,
        mainImage: null,
        minPrice: { amount: 1999, currency: "CNY" },
        maxPrice: { amount: 1999, currency: "CNY" },
        soldCount: 3,
    }
}

/** 词条就绪（默认「猜你喜欢」= 全站流） */
const tabsHandler = http.get("*/api/cms/recommend-tabs", () => HttpResponse.json([makeTab()]))

function renderFeed() {
    renderWithRouter(
        <>
            <Feed />
            <Outlet />
        </>,
    )
}

/** 让哨兵「进入视口」：取最近一次挂上的观察器（翻页状态变化会重建它） */
function enterViewport() {
    const observer = TestIntersectionObserver.instances.at(-1)
    if (!observer) throw new Error("哨兵还没挂上")
    act(() => observer.enter())
}

describe("首页商品流", () => {
    it("哨兵进入视口_追加第二页且保留第一页", async () => {
        const cursors: (string | null)[] = []
        server.use(
            tabsHandler,
            http.get("*/api/feed", ({ request }) => {
                const cursor = new URL(request.url).searchParams.get("cursor")
                cursors.push(cursor)
                return cursor
                    ? HttpResponse.json({ items: [makeItem("2")], nextCursor: null })
                    : HttpResponse.json({ items: [makeItem("1")], nextCursor: "c1" })
            }),
        )

        renderFeed()
        expect(await screen.findByText("商品 1")).toBeInTheDocument()
        expect(screen.queryByText("商品 2")).not.toBeInTheDocument()

        enterViewport()

        expect(await screen.findByText("商品 2")).toBeInTheDocument()
        expect(screen.getByText("商品 1")).toBeInTheDocument()
        // 第二页用第一页给的游标去取；末页游标为 null → 尾部收口成「没有更多了」
        expect(cursors).toEqual([null, "c1"])
        expect(await screen.findByText("没有更多了")).toBeInTheDocument()
    })

    it("追加页失败_保留第一页并可就地重试", async () => {
        let failOnce = true
        server.use(
            tabsHandler,
            http.get("*/api/feed", ({ request }) => {
                const cursor = new URL(request.url).searchParams.get("cursor")
                if (!cursor) return HttpResponse.json({ items: [makeItem("1")], nextCursor: "c1" })
                if (failOnce) {
                    failOnce = false
                    return HttpResponse.json(apiProblem(500, { detail: "服务器内部错误" }), {
                        status: 500,
                    })
                }
                return HttpResponse.json({ items: [makeItem("2")], nextCursor: null })
            }),
        )

        renderFeed()
        expect(await screen.findByText("商品 1")).toBeInTheDocument()

        enterViewport()
        expect(await screen.findByText("加载失败")).toBeInTheDocument()
        // 失败的是追加页：已加载内容留在原地，不整块换成错误态
        expect(screen.getByText("商品 1")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "重试" }))

        expect(await screen.findByText("商品 2")).toBeInTheDocument()
        expect(screen.getByText("商品 1")).toBeInTheDocument()
    })

    it("换一批_丢掉已加载页_只重拉第一页且不带游标", async () => {
        const cursors: (string | null)[] = []
        server.use(
            tabsHandler,
            http.get("*/api/feed", ({ request }) => {
                const cursor = new URL(request.url).searchParams.get("cursor")
                cursors.push(cursor)
                if (cursor) return HttpResponse.json({ items: [makeItem("2")], nextCursor: null })
                const firstTime = cursors.filter((c) => c === null).length === 1
                return HttpResponse.json({
                    items: [makeItem(firstTime ? "1" : "3")],
                    nextCursor: firstTime ? "c1" : null,
                })
            }),
        )

        renderFeed()
        expect(await screen.findByText("商品 1")).toBeInTheDocument()
        enterViewport()
        expect(await screen.findByText("商品 2")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "换一批" }))

        expect(await screen.findByText("商品 3")).toBeInTheDocument()
        // 换一批 = 换新种子重排：旧的第二页必须被丢掉，且重新从无游标的首请求开始
        expect(screen.queryByText("商品 2")).not.toBeInTheDocument()
        expect(cursors.filter((c) => c === null)).toHaveLength(2)
    })

    it("切词条_加载期间保留上一批卡片_既不换骨架也不拿旧游标翻页", async () => {
        const requests: string[] = []
        let releaseNewTab: (() => void) | undefined
        server.use(
            // 类目词条放第一位：jsdom 没有布局，推荐条一页只量得出 1 个词条
            http.get("*/api/cms/recommend-tabs", () =>
                HttpResponse.json([
                    makeTab({
                        id: "00000000-0000-4000-8000-0000000000f2",
                        name: "智能手机",
                        targetType: "CATEGORY",
                        target: CATEGORY_ID,
                        isDefault: false,
                    }),
                    makeTab(),
                ]),
            ),
            http.get("*/api/feed", async ({ request }) => {
                const search = new URL(request.url).searchParams
                requests.push(`${search.get("categoryId") ?? "-"}|${search.get("cursor") ?? "-"}`)
                if (!search.get("categoryId")) {
                    return HttpResponse.json({ items: [makeItem("1")], nextCursor: "c1" })
                }
                // 新词条的数据挂着不放行，模拟慢网下的切换窗口
                await new Promise<void>((resolve) => {
                    releaseNewTab = resolve
                })
                return HttpResponse.json({ items: [makeItem("cat")], nextCursor: null })
            }),
        )

        renderFeed()
        expect(await screen.findByText("商品 1")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "智能手机" }))
        await waitFor(() => expect(releaseNewTab).toBeDefined())

        // 数据未到：屏上还是上一批卡片（没有换成一屏骨架），尾部只说「加载中」
        expect(await screen.findByText("加载中…")).toBeInTheDocument()
        expect(screen.getByText("商品 1")).toBeInTheDocument()
        expect(screen.queryByText("没有更多了")).not.toBeInTheDocument()

        // 占位窗口里哨兵若触发，绝不能拿上一批的游标去翻新词条的页
        const before = requests.length
        enterViewport()
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(requests).toHaveLength(before)
        expect(requests.some((r) => r.endsWith("|c1"))).toBe(false)

        releaseNewTab?.()
        expect(await screen.findByText("商品 cat")).toBeInTheDocument()
        expect(screen.queryByText("商品 1")).not.toBeInTheDocument()
    })

    it("空结果_给空态而不是到底文案", async () => {
        server.use(
            tabsHandler,
            http.get("*/api/feed", () => HttpResponse.json({ items: [], nextCursor: null })),
        )

        renderFeed()

        expect(await screen.findByText("这个分类暂时没有商品")).toBeInTheDocument()
        // 「没有更多了」是「翻到底了」，空类目不是这个意思
        expect(screen.queryByText("没有更多了")).not.toBeInTheDocument()
    })

    it("切词条时列表已滚出视口_锚回吸顶条下方", async () => {
        // jsdom 没有布局：先把列表的矩形伪装成「顶部已滚出视口」，再盯住 scrollIntoView。
        // 锚定不做的话，空/短词条落地时文档高度塌下去，浏览器会把滚动位置钳回顶部（真浏览器实测 900 → 0）
        const scrollIntoView = vi.fn<() => void>()
        Object.defineProperty(Element.prototype, "scrollIntoView", {
            value: scrollIntoView,
            writable: true,
            configurable: true,
        })
        const rectSpy = vi
            .spyOn(Element.prototype, "getBoundingClientRect")
            .mockImplementation(function (this: Element) {
                const top =
                    this instanceof HTMLElement && this.classList.contains("feed-section")
                        ? -300
                        : 0
                return new DOMRect(0, top, 1400, 1000)
            })

        try {
            server.use(
                // 类目词条放第一位：jsdom 没有布局，推荐条一页只量得出 1 个词条
                http.get("*/api/cms/recommend-tabs", () =>
                    HttpResponse.json([
                        makeTab({
                            id: "00000000-0000-4000-8000-0000000000f2",
                            name: "智能手机",
                            targetType: "CATEGORY",
                            target: CATEGORY_ID,
                            isDefault: false,
                        }),
                        makeTab(),
                    ]),
                ),
                http.get("*/api/feed", ({ request }) =>
                    HttpResponse.json({
                        items: [
                            makeItem(
                                new URL(request.url).searchParams.get("categoryId") ? "cat" : "1",
                            ),
                        ],
                        nextCursor: null,
                    }),
                ),
            )

            renderFeed()
            // 首屏（首次挂载）不锚：用户在顶部时不该被动滚动
            expect(await screen.findByText("商品 1")).toBeInTheDocument()
            expect(scrollIntoView).not.toHaveBeenCalled()

            await userEvent.click(screen.getByRole("button", { name: "智能手机" }))

            expect(await screen.findByText("商品 cat")).toBeInTheDocument()
            expect(scrollIntoView).toHaveBeenCalledTimes(1)
        } finally {
            rectSpy.mockRestore()
        }
    })

    it("点类目词条_按该类目召回", async () => {
        const categoryParams: (string | null)[] = []
        server.use(
            // 类目词条放第一位：jsdom 没有布局（宽度全 0），推荐条一页只量得出 1 个词条
            http.get("*/api/cms/recommend-tabs", () =>
                HttpResponse.json([
                    makeTab({
                        id: "00000000-0000-4000-8000-0000000000f2",
                        name: "智能手机",
                        targetType: "CATEGORY",
                        target: CATEGORY_ID,
                        isDefault: false,
                    }),
                    makeTab(),
                ]),
            ),
            http.get("*/api/feed", ({ request }) => {
                const categoryId = new URL(request.url).searchParams.get("categoryId")
                categoryParams.push(categoryId)
                return HttpResponse.json({
                    items: [makeItem(categoryId ? "cat" : "all")],
                    nextCursor: null,
                })
            }),
        )

        renderFeed()
        // 默认项是「猜你喜欢」（搜索型）→ 首屏走全站流
        expect(await screen.findByText("商品 all")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "智能手机" }))

        expect(await screen.findByText("商品 cat")).toBeInTheDocument()
        expect(categoryParams).toEqual([null, CATEGORY_ID])
    })
})
