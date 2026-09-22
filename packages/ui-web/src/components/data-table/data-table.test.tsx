import { useState } from "react"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type {
    ColumnDef,
    PaginationState,
    RowSelectionState,
    SortingState,
} from "@tanstack/react-table"

import { Button } from "src/components/ui/button"
import { Input } from "src/components/ui/input"
import { renderWithProviders } from "src/test/render"
import {
    DataTable,
    DataTableToolbar,
    DataTablePagination,
    DataTableViewOptions,
    useDataTable,
    type DataTableFeatures,
} from "./index"

type Item = { id: string; status: string; name: string }
const ITEMS: Item[] = [
    { id: "a", status: "success", name: "Beta" },
    { id: "b", status: "failed", name: "Alpha" },
    { id: "c", status: "success", name: "Gamma" },
]
const columns: ColumnDef<DataTableFeatures, Item>[] = [
    { accessorKey: "status", header: "状态" },
    { accessorKey: "name", header: "名称" },
]

function ClientTable() {
    // 外部受控不等于服务端排序。
    const [sorting, setSorting] = useState<SortingState>([])
    const [globalFilter, setGlobalFilter] = useState("")
    const { table } = useDataTable({
        columns,
        data: ITEMS,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
    })
    return (
        <>
            <DataTableToolbar
                table={table}
                actions={<DataTableViewOptions table={table} />}
            >
                <Input
                    aria-label="搜索"
                    value={globalFilter}
                    onChange={(event) => table.setGlobalFilter(event.target.value)}
                />
                <Button onClick={() => table.setSorting([{ id: "name", desc: false }])}>
                    按名称升序
                </Button>
            </DataTableToolbar>
            <DataTable table={table} />
        </>
    )
}

function ServerTable() {
    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
    const [selectedIds, setSelectedIds] = useState("")
    const { table } = useDataTable({
        columns,
        data: ITEMS.slice(pagination.pageIndex, pagination.pageIndex + 1),
        rowCount: 20,
        getRowId: (row) => row.id,
        enableRowSelection: true,
        manualPagination: true,
        manualFiltering: true,
        manualSorting: true,
        state: { pagination, rowSelection },
        onPaginationChange: setPagination,
        onRowSelectionChange: setRowSelection,
    })
    return (
        <>
            <Button onClick={() => table.toggleAllPageRowsSelected(true)}>选择本页</Button>
            <DataTable table={table} />
            <DataTablePagination table={table} />
            <Button onClick={() => setSelectedIds(Object.keys(table.state.rowSelection).join(","))}>
                查看选中 ID
            </Button>
            <output aria-label="选中 ID">{selectedIds}</output>
        </>
    )
}

function BareTable() {
    const { table } = useDataTable({ columns, data: ITEMS })
    return <DataTable table={table} />
}

describe("DataTable 组合", () => {
    it("只渲染表格，不强塞工具栏和分页", () => {
        renderWithProviders(<BareTable />)
        expect(screen.getAllByRole("row")).toHaveLength(4)
        expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })
    it("受控排序仍可在客户端执行，不根据回调推断 manualSorting", async () => {
        const user = userEvent.setup()
        renderWithProviders(<ClientTable />)
        await user.click(screen.getByRole("button", { name: "按名称升序" }))
        expect(
            within(screen.getAllByRole("row")[1]!).getByRole("cell", { name: "Alpha" }),
        ).toBeInTheDocument()
    })
    it("受控全局搜索可重置，不只检查列筛选状态", async () => {
        const user = userEvent.setup()
        renderWithProviders(<ClientTable />)
        await user.type(screen.getByRole("textbox", { name: "搜索" }), "Gamma")
        expect(screen.getAllByRole("row")).toHaveLength(2)
        await user.click(screen.getByRole("button", { name: /重置/ }))
        expect(screen.getByRole("textbox", { name: "搜索" })).toHaveValue("")
        expect(screen.getAllByRole("row")).toHaveLength(4)
    })
    it("列显隐显示文案而非字段名，切换同时更新表头与数据", async () => {
        const user = userEvent.setup()
        renderWithProviders(<ClientTable />)
        screen.getByRole("button", { name: "列" }).focus()
        await user.keyboard("{ArrowDown}")
        await user.click(await screen.findByRole("menuitemcheckbox", { name: "名称" }))
        expect(screen.queryByRole("columnheader", { name: "名称" })).not.toBeInTheDocument()
        expect(screen.queryByRole("cell", { name: "Beta" })).not.toBeInTheDocument()
    })
    it("服务端翻页不二次切片，受控选中 ID 跨页保留", async () => {
        const user = userEvent.setup()
        renderWithProviders(<ServerTable />)
        await user.click(screen.getByRole("button", { name: "选择本页" }))
        await user.click(screen.getByRole("button", { name: "下一页" }))
        expect(screen.getByRole("cell", { name: "Alpha" })).toBeInTheDocument()
        expect(screen.getByText(/第 2\/2 页/)).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "选择本页" }))
        await user.click(screen.getByRole("button", { name: "查看选中 ID" }))
        expect(screen.getByLabelText("选中 ID")).toHaveTextContent("a,b")
    })
})
