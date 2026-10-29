import { screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { renderWithRouter } from "@shop/app-kit/test"

import { adminMessages } from "#/locales"
import { tokenStore } from "#/shared/lib/api"
import { AppSidebar } from "./app-sidebar"

function columnsOf(container: HTMLElement): string[] {
    return [...container.querySelectorAll("aside")].map(
        (aside) => [...aside.classList].find((cls) => cls.startsWith("w-")) ?? "(无宽度)",
    )
}

describe("管理端共享侧栏", () => {
    afterEach(() => tokenStore.clear())

    it("窄轨只渲染后端真有端点的两组：账号与商品", async () => {
        renderWithRouter(<AppSidebar />, { resources: adminMessages, initialEntry: "/categories" })

        expect(await screen.findByRole("button", { name: "账号" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "商品" })).toBeInTheDocument()
        // 重写期没有后端的组不渲染：商家、优惠券、审计、CMS、RUM
        expect(screen.queryByRole("button", { name: "商家" })).toBeNull()
    })

    it("二级面板只展开当前分组，当前叶子高亮", async () => {
        renderWithRouter(<AppSidebar />, { resources: adminMessages, initialEntry: "/categories" })

        expect(await screen.findByRole("link", { name: "类目管理" })).toHaveAttribute(
            "aria-current",
            "page",
        )
        // 账号组不在当前路径上，它的叶子不渲染
        expect(screen.queryByRole("link", { name: "用户管理" })).toBeNull()
    })

    it("切到账号组后显示买家与员工两个入口", async () => {
        renderWithRouter(<AppSidebar />, {
            resources: adminMessages,
            initialEntry: "/accounts/users",
        })

        expect(await screen.findByRole("link", { name: "用户管理" })).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "员工管理" })).toBeInTheDocument()
    })

    it("两列宽度稳定：图标列 + 菜单列", async () => {
        const { container } = renderWithRouter(<AppSidebar />, {
            resources: adminMessages,
            initialEntry: "/categories",
        })
        await screen.findByRole("link", { name: "类目管理" })
        expect(columnsOf(container)).toEqual(["w-24", "w-44"])
    })
})
