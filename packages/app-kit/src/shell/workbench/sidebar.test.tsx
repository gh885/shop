import { screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import { renderWithRouter } from "../../test"
import type { SidebarGroup, SidebarLeaf } from "./navigation"
import { WorkbenchSidebar } from "./sidebar"

/**
 * 双列侧栏的**列几何**：两列的宽度是内容区的左边界，所以「什么时候有几列」必须是首帧就定稿的
 * 版式事实，不能是数据的函数——装配说「菜单还没到」时，二级列也要在位（管理端审核台实测：
 * 二级列等权限落地才插进来，把内容区整体推走 176px，CLS 0.630，见 perf/README）。
 *
 * jsdom 不排版，能核对的只有类名，而类名正是这两列宽度的唯一真相（w-24 / w-44 由轨与面板各自持有）。
 */

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
        // 路由挂载是异步的，先等一个两帧都在的元素当门；骨架整块 aria-hidden，
        // 所以按无障碍树查是 0 列（读屏不该被两个空 landmark 打断），按 DOM 查是 2 列。
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
