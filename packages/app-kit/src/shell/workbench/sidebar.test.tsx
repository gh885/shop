import { StrictMode } from "react"
import userEvent from "@testing-library/user-event"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import { renderWithRouter } from "../../test"
import type { SidebarGroup, SidebarLeaf } from "./navigation"
import { WorkbenchSidebar } from "./sidebar"

/** 列几何必须首帧定稿、不能是数据的函数（否则二级列后插把内容区推走，CLS 见 perf/README）；jsdom 不排版，只能核对类名 w-24 / w-44 这两列宽度的唯一真相 */

const AUDIT_GROUP: SidebarGroup = {
    key: "audit",
    label: "审计",
    sections: [{ title: "治理留痕", items: [{ key: "audits", label: "操作审计", to: "/audits" }] }],
}

const HOME_LEAF: SidebarLeaf = { key: "home", label: "首页", to: "/" }

/** 侧栏此刻有几列、各多宽 */
function columnsOf(container: HTMLElement): string[] {
    return [...container.querySelectorAll("aside")].map(
        (aside) => [...aside.classList].find((cls) => cls.startsWith("w-")) ?? "(无宽度)",
    )
}

describe("WorkbenchSidebar 的列几何", () => {
    it("菜单未落地：两列照常占位，列里一个入口都不给（先渲染少项菜单，落地那一刻就是一次推挤）", async () => {
        const { container } = renderWithRouter(
            <WorkbenchSidebar
                items={[]}
                pathname="/audits"
                pending
            />,
        )
        // 路由挂载异步，先等一个两帧都在的元素当门
        // 骨架整块 aria-hidden：按无障碍树查 0 列（读屏不被空 landmark 打断），按 DOM 查是 2 列
        await screen.findByRole("navigation", { hidden: true })
        expect(columnsOf(container)).toEqual(["w-24", "w-44"])
        expect(screen.queryAllByRole("complementary")).toHaveLength(0)
        expect(screen.queryAllByRole("link")).toHaveLength(0)
    })

    it("菜单落地：还是那两列、还是那两个宽度", async () => {
        const { container } = renderWithRouter(
            <WorkbenchSidebar
                items={[AUDIT_GROUP]}
                pathname="/audits"
            />,
        )
        await screen.findByRole("link", { name: "操作审计" })
        expect(columnsOf(container)).toEqual(["w-24", "w-44"])
    })

    it("一级叶子路由没有二级列：不替它占位（占宽就等于凭空留一列）", async () => {
        const { container } = renderWithRouter(
            <WorkbenchSidebar
                items={[HOME_LEAF]}
                pathname="/"
            />,
        )
        await screen.findByRole("link", { name: "首页" })
        expect(columnsOf(container)).toEqual(["w-24"])
    })
})

describe("WorkbenchSidebar 折叠分组", () => {
    it("严格模式下挂载、折叠和展开当前分组不会循环更新", async () => {
        const user = userEvent.setup()
        renderWithRouter(
            <StrictMode>
                <WorkbenchSidebar
                    items={[
                        {
                            ...AUDIT_GROUP,
                            sections: [{ ...AUDIT_GROUP.sections[0]!, collapsible: true }],
                        },
                    ]}
                    pathname="/audits"
                />
            </StrictMode>,
        )
        const trigger = await screen.findByRole("button", { name: "治理留痕" })
        expect(trigger).toHaveAttribute("aria-expanded", "true")
        await user.click(trigger)
        expect(trigger).toHaveAttribute("aria-expanded", "false")
        await user.click(trigger)
        expect(trigger).toHaveAttribute("aria-expanded", "true")
        expect(screen.getByRole("link", { name: "操作审计" })).toBeVisible()
    })
})
