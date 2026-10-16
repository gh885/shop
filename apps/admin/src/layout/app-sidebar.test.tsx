import type { StaffInfo } from "@shop/api/sdk"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { renderWithRouter } from "@shop/app-kit/test"
import { server } from "@shop/test-utils"

import { adminMessages } from "#/locales"
import { tokenStore } from "#/shared/lib/api"
import { AppSidebar } from "./app-sidebar"

const AUDIT_STAFF: StaffInfo = {
    // id 必须是合法 UUID：SDK 对 /admin/auth/me 做契约校验，形状不对等于 me 失败
    id: "00000000-0000-4000-8000-0000000000a1",
    employeeNo: "A-001",
    displayName: "管理员",
    role: "OPS",
    permissions: ["AUDIT_VIEW"],
    preferredLocale: null,
}

function columnsOf(container: HTMLElement): string[] {
    return [...container.querySelectorAll("aside")].map(
        (aside) => [...aside.classList].find((cls) => cls.startsWith("w-")) ?? "(无宽度)",
    )
}

describe("管理端共享侧栏", () => {
    afterEach(() => tokenStore.clear())

    it("根路径审核页同时高亮商家与入驻审核，点击菜单保留分页参数", async () => {
        const user = userEvent.setup()
        const { router } = renderWithRouter(<AppSidebar />, { resources: adminMessages })
        const review = await screen.findByRole("link", { name: "入驻审核" })
        expect(review).toHaveAttribute("aria-current", "page")
        const merchant = screen.getByRole("button", { name: "商家" })
        expect(merchant).toHaveAttribute("aria-current", "true")
        expect(review).toHaveAttribute("href", "/?page=1&size=20")
        expect(merchant).toHaveAttribute("href", "/?page=1&size=20")
        await user.click(review)
        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({ page: 1, size: 20 }),
        )
    })

    it("首份权限还在路上就先把两列占好：权限落地只换列里的条目，不换列", async () => {
        const me = deferred<Response>()
        server.use(http.get("*/admin/auth/me", () => me.promise))
        tokenStore.set("stub-access-token")
        const { container } = renderWithRouter(<AppSidebar />, {
            resources: adminMessages,
            initialEntry: "/audits",
        })

        await waitFor(() => expect(columnsOf(container)).toEqual(["w-24", "w-44"]))
        expect(screen.queryAllByRole("link")).toHaveLength(0)

        me.resolve(HttpResponse.json(AUDIT_STAFF))
        expect(await screen.findByRole("link", { name: "操作审计" })).toBeInTheDocument()
        expect(columnsOf(container)).toEqual(["w-24", "w-44"])
    })
})

function deferred<T>() {
    let settle!: (value: T) => void
    const promise = new Promise<T>((resolve) => {
        settle = resolve
    })
    return { promise, resolve: settle }
}
