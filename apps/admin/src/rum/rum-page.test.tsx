import type { AdminRumEventDetail, AdminRumEventItem, AdminRumIssueItem } from "@shop/api/sdk"
import { createAppTestQueryClient, renderWithProviders } from "@shop/app-kit/test"
import { server } from "@shop/test-utils"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"
import { adminMessages } from "#/locales"
import { RumEventDetailSheet } from "./detail-sheet"
import { RumEventFilters } from "./event-filters"
import { RumIssueFilters } from "./filters"
import {
    rumEventDetailOptions,
    rumEventListOptions,
    rumIssueListOptions,
    type RumEventSearch,
    type RumIssueSearch,
} from "./queries"

/**
 * 遥测排查页的三处「接缝」——都是不连真页面就验不到、且错了不会报错的那几格：
 *  ① 聚合行没有主键（一个「问题」是后端算出来的），列表外壳却要求每行有唯一 id；
 *  ② 筛选栏是本地草稿，只有「应用筛选 / 回车」才写回 URL，空白要折成 undefined；
 *  ③ 原件按不透明字符串透传，**解析失败也必须原样显示**——那是唯一一份现场。
 */

const ISSUE: AdminRumIssueItem = {
    fingerprint: "boom::at f",
    app: "web",
    kind: "error",
    message: "Cannot read properties of undefined",
    route: "/orders/$id",
    sessions: 3,
    events: 5,
    firstSeen: "2026-10-16T10:00:00Z",
    lastSeen: "2026-10-16T11:00:00Z",
}

const EVENT: AdminRumEventItem = {
    id: "00000000-0000-4000-8000-000000000001",
    ts: "2026-10-16T10:00:00Z",
    createdAt: "2026-10-16T10:00:01Z",
    app: "web",
    kind: "error",
    name: "js_error",
    version: "abc1234",
    env: "prod",
    route: "/orders/$id",
    sessionId: "s-1",
    userId: "u-1",
    fingerprint: "boom::at f",
    message: "Cannot read properties of undefined",
}

const DETAIL: AdminRumEventDetail = {
    ...EVENT,
    payload: '{"stack":"Error: boom","breadcrumbs":[]}',
}

describe("rumIssueListOptions", () => {
    it("出参裁成 records/total，并给聚合行补上定位 id", async () => {
        let lastUrl = ""
        server.use(
            http.get("*/admin/rum/issues", ({ request }) => {
                lastUrl = request.url
                return HttpResponse.json({ records: [ISSUE], total: 1 })
            }),
        )
        const client = createAppTestQueryClient()

        const data = await client.fetchQuery(
            rumIssueListOptions({ page: 2, size: 20, app: "seller" }),
        )

        expect(data.total).toBe(1)
        // 端点在 records 里给不出主键（一个「问题」是聚合出来的），而列表外壳泛型要求 `id`；
        // 定位键必须与后端的分组键一致，否则同一个指纹在两个端上会撞成同一行。
        expect(data.records[0]).toEqual({ ...ISSUE, id: "boom::at f|web|error" })
        expect(lastUrl).toContain("seller")
    })
})

describe("rumEventListOptions", () => {
    it("指纹进查询串，出参只裁 records/total", async () => {
        let lastUrl = ""
        server.use(
            http.get("*/admin/rum/events", ({ request }) => {
                lastUrl = request.url
                return HttpResponse.json({ records: [EVENT], total: 1 })
            }),
        )
        const client = createAppTestQueryClient()

        const data = await client.fetchQuery(
            rumEventListOptions({ page: 1, size: 50, fingerprint: "boom::at f", app: "web" }),
        )

        expect(data).toEqual({ records: [EVENT], total: 1 })
        expect(lastUrl).toContain("boom")
    })

    it("不筛任何条件时，空白筛选值不进请求串", async () => {
        let lastUrl = ""
        server.use(
            http.get("*/admin/rum/events", ({ request }) => {
                lastUrl = request.url
                return HttpResponse.json({ records: [], total: 0 })
            }),
        )
        const client = createAppTestQueryClient()

        await client.fetchQuery(rumEventListOptions({ page: 1, size: 50 }))

        expect(lastUrl).not.toContain("boom")
        expect(lastUrl).not.toContain("undefined")
    })

    it("原件按 id 单取，不给列表页预先拉全量堆栈", async () => {
        let lastUrl = ""
        server.use(
            http.get("*/admin/rum/events/*", ({ request }) => {
                lastUrl = request.url
                return HttpResponse.json(DETAIL)
            }),
        )
        const client = createAppTestQueryClient()

        const detail = await client.fetchQuery(rumEventDetailOptions(EVENT.id))

        expect(detail.payload).toBe(DETAIL.payload)
        expect(lastUrl).toContain(EVENT.id)
    })
})

describe("RumIssueFilters", () => {
    it("应用筛选把时间窗写回 URL 并把页码拍回 1；不填的时间折成 undefined", async () => {
        const navigate = vi.fn<(options: { search: RumIssueSearch }) => void>()
        renderWithProviders(
            <RumIssueFilters
                search={{ page: 3, size: 20 }}
                navigate={navigate}
            />,
            { resources: adminMessages },
        )

        await userEvent.setup().click(screen.getByRole("button", { name: "应用筛选" }))

        const arg = navigate.mock.calls[0]?.[0]
        expect(arg?.search).toMatchObject({ page: 1 })
        // 空时间不进 URL，也就不进 query key——否则每换一次筛选都会多出一份空窗口的缓存
        expect(arg?.search.from).toBeUndefined()
        expect(arg?.search.to).toBeUndefined()
    })
})

describe("RumEventFilters", () => {
    it("清掉指纹只放宽这一格，端仍旧留着", async () => {
        const navigate = vi.fn<(options: { search: RumEventSearch }) => void>()
        renderWithProviders(
            <RumEventFilters
                search={{ page: 1, size: 50, fingerprint: "boom::at f", app: "web" }}
                navigate={navigate}
            />,
            { resources: adminMessages },
        )
        const user = userEvent.setup()

        await user.clear(screen.getByLabelText("指纹"))
        await user.click(screen.getByRole("button", { name: "应用筛选" }))

        const arg = navigate.mock.calls[0]?.[0]
        expect(arg?.search.fingerprint).toBeUndefined()
        expect(arg?.search.app).toBe("web")
    })
})

describe("RumEventDetailSheet", () => {
    it("打开时取原件并把它摆出来", async () => {
        server.use(http.get("*/admin/rum/events/*", () => HttpResponse.json(DETAIL)))
        renderWithProviders(
            <RumEventDetailSheet
                event={EVENT}
                onClose={() => {}}
            />,
            { resources: adminMessages },
        )

        expect(await screen.findByText("事件原件")).toBeTruthy()
        expect(await screen.findByText(/Error: boom/)).toBeTruthy()
    })

    it("payload 不是合法 JSON 时原样显示，不吞掉唯一那份现场", async () => {
        server.use(
            http.get("*/admin/rum/events/*", () =>
                HttpResponse.json({ ...DETAIL, payload: "堆栈：格式化这一步不该让现场消失" }),
            ),
        )
        renderWithProviders(
            <RumEventDetailSheet
                event={EVENT}
                onClose={() => {}}
            />,
            { resources: adminMessages },
        )

        expect(await screen.findByText("堆栈：格式化这一步不该让现场消失")).toBeTruthy()
    })
})
