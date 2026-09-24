import type { ReactElement } from "react"
import type { CmsStatus } from "@shop/api/sdk"

import type { ColumnDef } from "@tanstack/react-table"
import { renderWithProviders } from "@shop/app-kit/test"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Badge, type DataTableFeatures } from "@shop/ui-web"

import { cmsStatusColumn, sortOrderColumn } from "./list-columns"
import { actionsColumn } from "#/shared/ui/columns"
import { CmsListPage } from "./list-page"

/**
 * CMS 列表页骨架：加载态 / 空态 / 筛选值往哪去 / 新增对话框的开合。
 * 列用的是共享片段（排序、状态、操作），顺带钉住「启用中 / 已停用」这两句措辞。
 */

type Entry = { id: string; name: string; sortOrder: number; status: CmsStatus }

const entries: Entry[] = [
    { id: "e1", name: "顶部大促入口", sortOrder: 1, status: "ENABLED" },
    { id: "e2", name: "频道入口", sortOrder: 2, status: "DISABLED" },
]

const columns: ColumnDef<DataTableFeatures, Entry>[] = [
    {
        accessorKey: "name",
        header: "名称",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    sortOrderColumn(),
    cmsStatusColumn(),
    actionsColumn((entry) => <Badge variant="outline">{entry.id}</Badge>),
]

const renderCreate = vi.fn<(state: { open: boolean }) => ReactElement>(({ open }) => (
    <span>对话框:{String(open)}</span>
))

function renderPage({
    rows = entries,
    isPending = false,
    filter,
}: {
    rows?: Entry[]
    isPending?: boolean
    filter?: {
        label: string
        value?: string
        options: readonly string[]
        onChange: (value: string | undefined) => void
    }
} = {}) {
    renderWithProviders(
        <CmsListPage
            title="首页导航"
            description="买家端顶部导航配置"
            columns={columns}
            rows={rows}
            isPending={isPending}
            emptyText="暂无符合条件的导航条目"
            createText="新增条目"
            filter={filter}
            renderCreate={renderCreate}
        />,
    )
}

describe("CmsListPage", () => {
    it("加载中只出骨架，不先闪一张空表", () => {
        renderPage({ isPending: true })

        expect(screen.getByText("正在加载列表")).toBeInTheDocument()
        expect(screen.queryByText("顶部大促入口")).toBeNull()
        expect(screen.queryByText("暂无符合条件的导航条目")).toBeNull()
    })

    it("按共享片段渲染每行：名称、排序、状态文案、操作列", () => {
        renderPage()

        expect(screen.getByText("顶部大促入口")).toBeInTheDocument()
        expect(screen.getByText("启用中")).toBeInTheDocument()
        expect(screen.getByText("已停用")).toBeInTheDocument()
        expect(screen.getByText("e1")).toBeInTheDocument()
    })

    it("筛完没有结果时说明为什么空，而不是留一张零高的表", () => {
        renderPage({ rows: [] })

        expect(screen.getByText("暂无符合条件的导航条目")).toBeInTheDocument()
    })

    it("超过一页的全量数据能翻到：第 11 行不静默消失", async () => {
        const user = userEvent.setup()
        const many: Entry[] = Array.from({ length: 15 }, (_, i) => ({
            id: `m${i + 1}`,
            name: `条目${i + 1}`,
            sortOrder: i + 1,
            status: "ENABLED",
        }))
        renderPage({ rows: many })

        expect(screen.queryByText("条目11")).toBeNull()
        await user.click(screen.getByRole("button", { name: "下一页" }))
        expect(screen.getByText("条目11")).toBeInTheDocument()
    })

    it("新增按钮打开页面自己交进来的对话框", async () => {
        const user = userEvent.setup()
        renderPage()

        await user.click(screen.getByRole("button", { name: "新增条目" }))

        expect(screen.getByText("对话框:true")).toBeInTheDocument()
    })

    it("筛选：选中值原样传出，选「全部 X」传 undefined（URL 上不该留着 all）", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn<(value: string | undefined) => void>()
        renderPage({ filter: { label: "导航位", options: ["home"], onChange } })

        await user.click(await screen.findByLabelText("导航位"))
        await user.click(await screen.findByRole("option", { name: "home" }))
        expect(onChange).toHaveBeenCalledWith("home")

        await user.click(await screen.findByLabelText("导航位"))
        await user.click(await screen.findByRole("option", { name: "全部导航位" }))
        expect(onChange).toHaveBeenCalledWith(undefined)
    })
})
