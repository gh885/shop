import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import {
    DataTable,
    DataTableCard,
    DataTableI18nProvider,
    DataTableViewOptions,
    useDataTable,
} from "./index"

/**
 * DataTable 接线测试要钉住：表实例是活的（浅拷贝成快照会让 getRowModel 失联、表格空白）；
 * 项目列 meta（variant/className）落到 reui 读的两个字段；分页「共 N 条」取 getRowCount() 总数而非当前页行数（传错静默显当前页条数）；
 * 列显隐组件能渲染 = 工具栏确在 DataTable provider 内（provider 外 useDataGrid() 直接抛，所有用例红）。
 */
type Row = { id: string; name: string; qty: number }

const rows: Row[] = [
    { id: "1", name: "甲", qty: 12 },
    { id: "2", name: "乙", qty: 7 },
]

function Harness({ rowCount }: { rowCount?: number } = {}) {
    const { table } = useDataTable<Row>({
        data: rows,
        getRowId: (r) => r.id,
        columns: [
            { accessorKey: "name", header: "名称", meta: { variant: "strong" } },
            { accessorKey: "qty", header: "数量", meta: { className: "tabular-nums" } },
        ],
        ...(rowCount === undefined
            ? {}
            : {
                  rowCount,
                  manualPagination: true,
                  state: { pagination: { pageIndex: 0, pageSize: 10 } },
              }),
    })

    return (
        <DataTable table={table}>
            <DataTableViewOptions table={table} />
            <DataTableCard />
        </DataTable>
    )
}

function EmptyHarness() {
    const { table } = useDataTable<Row>({ data: [], getRowId: (r) => r.id, columns: [] })
    return (
        <DataTable
            table={table}
            emptyContent="空空如也"
        >
            <DataTableCard />
        </DataTable>
    )
}

describe("DataTable", () => {
    it("渲染全部数据行（表实例未被浅拷贝成死快照）", () => {
        render(<Harness />)

        expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument()
        expect(screen.getByText("甲")).toBeInTheDocument()
        expect(screen.getByText("乙")).toBeInTheDocument()
    })

    it("列 meta：variant 与 className 落到单元格", () => {
        render(<Harness />)

        const strongCell = screen.getByText("甲").closest("td")
        expect(strongCell?.className).toContain("font-medium")
        const numCell = screen.getByText("12").closest("td")
        expect(numCell?.className).toContain("tabular-nums")
    })

    it("className 也落到表头", () => {
        render(<Harness />)

        const header = screen.getByRole("columnheader", { name: "数量" })
        expect(header.className).toContain("tabular-nums")
    })

    it("空态走 emptyContent", () => {
        render(<EmptyHarness />)

        expect(within(document.body).getByText("空空如也")).toBeInTheDocument()
    })

    it("分页条的中文计数取总数（服务端分页只加载了当前页）", () => {
        // ui-web 兜底 reui 英文、中文计数由 app-kit provider 灌入：这里挂 provider 复现该通道，钉住分页标签取总数（42）非当前页行数。
        render(
            <DataTableI18nProvider
                value={{
                    overrides: {
                        labels: {
                            rowsPerPage: "每页",
                            paginationInfo: ({ from, to, count }) =>
                                `第 ${from}-${to} 条 · 共 ${count} 条`,
                        },
                    },
                    emptyText: "暂无数据",
                    columnsLabel: "列",
                    resetText: "重置",
                }}
            >
                <Harness rowCount={42} />
            </DataTableI18nProvider>,
        )

        expect(screen.getByText("第 1-10 条 · 共 42 条")).toBeInTheDocument()
        expect(screen.getByText("每页")).toBeInTheDocument()
    })
})
