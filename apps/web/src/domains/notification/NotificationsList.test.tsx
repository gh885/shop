import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { renderWithProviders } from "@shop/app-kit/test"
import { makeNotificationView, server } from "@shop/test-utils"

import type { NotificationView } from "@shop/api/sdk"

import { webMessages } from "#/locales"
import { NotificationsList } from "./NotificationsList"

function mockPage(items: NotificationView[], nextCursor: string | null = null) {
    let readCalls = 0
    let readAllCalls = 0
    server.use(
        http.get("*/buyer/notifications", () => HttpResponse.json({ items, nextCursor })),
        http.post("*/buyer/notifications/:id/read", () => {
            readCalls += 1
            return new HttpResponse(null, { status: 200 })
        }),
        http.post("*/buyer/notifications/read-all", () => {
            readAllCalls += 1
            return new HttpResponse(null, { status: 200 })
        }),
    )
    return {
        readCalls: () => readCalls,
        readAllCalls: () => readAllCalls,
    }
}

function renderList(
    items: NotificationView[],
    handlers?: { onOpen?: (item: NotificationView) => void },
) {
    return renderWithProviders(
        <NotificationsList
            items={items}
            loading={false}
            nextCursor={null}
            onOpen={handlers?.onOpen ?? vi.fn<(item: NotificationView) => void>()}
            onLoadMore={vi.fn<() => void>()}
        />,
        { resources: webMessages },
    )
}

describe("NotificationsList", () => {
    it("未读发货通知_出模板文案与运单号", async () => {
        const items = [makeNotificationView()]
        mockPage(items)
        renderList(items)

        expect(await screen.findByText("您的包裹已发货（sf SF123456789）")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "全部已读" })).toBeInTheDocument()
    })

    it("点击通知_触发标已读并回调 onOpen", async () => {
        const user = userEvent.setup()
        const onOpen = vi.fn<(item: NotificationView) => void>()
        const items = [makeNotificationView()]
        const counters = mockPage(items)
        renderList(items, { onOpen })

        await user.click(await screen.findByText("您的包裹已发货（sf SF123456789）"))

        expect(onOpen).toHaveBeenCalledTimes(1)
        await vi.waitFor(() => expect(counters.readCalls()).toBe(1))
    })

    it("全部已读_打 read-all 接口", async () => {
        const user = userEvent.setup()
        const items = [makeNotificationView()]
        const counters = mockPage(items)
        renderList(items)

        await user.click(await screen.findByRole("button", { name: "全部已读" }))

        await vi.waitFor(() => expect(counters.readAllCalls()).toBe(1))
    })

    it("退款通知_金额走 Price 出元与分，不裸拼分", async () => {
        const items = [
            makeNotificationView({
                type: "refund_succeeded",
                params: { orderGroupId: crypto.randomUUID(), amount: 2500, currency: "CNY" },
            }),
        ]
        mockPage(items)
        renderList(items)

        expect(await screen.findByText("您的退款已到账")).toBeInTheDocument()
        expect(screen.getByText("25")).toBeInTheDocument()
        expect(screen.getByText(".00")).toBeInTheDocument()
    })

    it("空列表_出空态不出全部已读按钮", async () => {
        mockPage([])
        renderList([])

        expect(await screen.findByText("没有通知")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "全部已读" })).not.toBeInTheDocument()
    })

    it("加载中_出骨架屏", () => {
        renderWithProviders(
            <NotificationsList
                items={[]}
                loading={true}
                nextCursor={null}
                onOpen={vi.fn<(item: NotificationView) => void>()}
                onLoadMore={vi.fn<() => void>()}
            />,
            { resources: webMessages },
        )

        expect(screen.getByRole("heading", { name: "站内信" })).toBeInTheDocument()
        expect(screen.queryByText("没有通知")).not.toBeInTheDocument()
    })
})
