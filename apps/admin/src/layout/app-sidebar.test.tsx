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

/** 侧栏的形状由权限决定，所以权限在路上的那一帧也得有个形状：这两条用例盯的是「列不会变」 */
const AUDIT_STAFF: StaffInfo = {
    // id 必须是合法 UUID：SDK 对 /admin/auth/me 做契约校验，形状不对等于 me 失败
    id: "00000000-0000-4000-8000-0000000000a1",
    employeeNo: "A-001",
    displayName: "管理员",
    role: "OPS",
    permissions: ["AUDIT_VIEW"],
    preferredLocale: null,
}

/** 侧栏此刻有几列、各多宽（与 @shop/app-kit 那条同口径：jsdom 不排版，类名就是列宽的唯一真相） */
function columnsOf(container: HTMLElement): string[] {
    return [...container.querySelectorAll("aside")].map(
        (aside) => [...aside.classList].find((cls) => cls.startsWith("w-")) ?? "(无宽度)",
    )
}

describe("管理端共享侧栏", () => {
    // authKit 是模块级单例：把登录态留到下一条用例会污染它的判据
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
        // 让 me 由测试按下发落键，而不是抢 50ms 的钟点：未落地那一帧要看得见，
        // 「换列」这件事才可能被断言到（延迟响应只是在赌 waitFor 的轮询落在哪一侧）
        const me = deferred<Response>()
        server.use(http.get("*/admin/auth/me", () => me.promise))
        // 壳的渲染前提是守卫已放行（_app 的 beforeLoad 等过 bootstrap），这里同样先把它落成 authed
        tokenStore.set("stub-access-token")
        const { container } = renderWithRouter(<AppSidebar />, {
            resources: adminMessages,
            initialEntry: "/audits",
        })

        // 未落地：两列都在位，列里一个入口都没有（既不是少项菜单，也不是权限闪一下）
        await waitFor(() => expect(columnsOf(container)).toEqual(["w-24", "w-44"]))
        expect(screen.queryAllByRole("link")).toHaveLength(0)

        // 落地：条目出现，宽度记号一个没动 —— 内容区的左边界因此从未移动过
        me.resolve(HttpResponse.json(AUDIT_STAFF))
        expect(await screen.findByRole("link", { name: "操作审计" })).toBeInTheDocument()
        expect(columnsOf(container)).toEqual(["w-24", "w-44"])
    })
})

/** 一个能被测试按下去的 promise：MSW 的 handler 允许返回 promise，响应什么时候到由用例说 */
function deferred<T>() {
    let settle!: (value: T) => void
    const promise = new Promise<T>((resolve) => {
        settle = resolve
    })
    return { promise, resolve: settle }
}
