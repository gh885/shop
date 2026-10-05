import type { AdminAuditItem } from "@shop/api/sdk"

import { createAppTestQueryClient, renderWithProviders } from "@shop/app-kit/test"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { server } from "@shop/test-utils"
import { adminMessages } from "#/locales"
import { AuditFilters } from "./filters"
import { auditListOptions, type AuditSearch } from "./queries"

/**
 * 操作审计页的两处「筛选」接线（AUDIT-05 那类反查账本）。
 *  ① 筛选栏是本地态：只有「应用筛选 / 回车」才写回 URL，且把页码拍回第 1 页——否则每敲一个字符打一次接口；
 *     空白输入折成 undefined，不污染 key，也不给后端带一个空串筛选。
 *  ② 带条件取数时筛选值进查询串，出参只裁 records/total（页面对整包 PageResult 之外的字段一无所知）。
 */

const OPERATOR = "00000000-0000-4000-8000-0000000000ff"

const AUDIT: AdminAuditItem = {
    id: "00000000-0000-4000-8000-000000000001",
    action: "shop.trading_suspended",
    targetType: "SHOP",
    targetId: "00000000-0000-4000-8000-0000000000aa",
    operatorId: OPERATOR,
    operatorName: "张三",
    detail: "name=海边小店, owner_id=x",
    createdAt: "2026-09-23T10:00:00Z",
}

describe("AuditFilters", () => {
    it("应用筛选把输入写回 URL，空白折成 undefined，页码拍回 1", async () => {
        const navigate = vi.fn<(options: { search: AuditSearch }) => void>()
        renderWithProviders(
            <AuditFilters
                search={{ page: 3, size: 20 }}
                navigate={navigate}
            />,
            { resources: adminMessages },
        )
        const user = userEvent.setup()

        await user.type(screen.getByLabelText("操作人 ID"), OPERATOR)
        await user.click(screen.getByRole("button", { name: "应用筛选" }))

        expect(navigate).toHaveBeenCalledTimes(1)
        const arg = navigate.mock.calls[0]?.[0]
        expect(arg?.search).toMatchObject({ operatorId: OPERATOR, page: 1 })
        // 没填的对象 ID 不该带一个空串进 URL / 进 key
        expect(arg?.search.targetId).toBeUndefined()
    })
})

describe("auditListOptions", () => {
    it("带条件取数：值进查询串，出参只裁 records/total", async () => {
        let lastUrl = ""
        server.use(
            http.get("*/admin/audits", ({ request }) => {
                lastUrl = request.url
                return HttpResponse.json({ records: [AUDIT], total: 1 })
            }),
        )
        const client = createAppTestQueryClient()

        const data = await client.fetchQuery(
            auditListOptions({
                page: 2,
                size: 20,
                operatorId: OPERATOR,
                targetType: "SHOP",
                action: "shop.trading_suspended",
            }),
        )

        expect(data).toEqual({ records: [AUDIT], total: 1 })
        // 断言的是「筛选值确实进了请求」，与 SDK 具体怎么序列化嵌套参数无关
        expect(lastUrl).toContain(OPERATOR)
        expect(lastUrl).toContain("shop.trading_suspended")
    })

    it("不筛任何条件时，空白筛选值不进请求串", async () => {
        let lastUrl = ""
        server.use(
            http.get("*/admin/audits", ({ request }) => {
                lastUrl = request.url
                return HttpResponse.json({ records: [], total: 0 })
            }),
        )
        const client = createAppTestQueryClient()

        const data = await client.fetchQuery(auditListOptions({ page: 1, size: 20 }))

        expect(data).toEqual({ records: [], total: 0 })
        expect(lastUrl).not.toContain(OPERATOR)
        expect(lastUrl).not.toContain("shop.trading_suspended")
    })
})
