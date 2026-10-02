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
 * DataTable 接线测试。要钉住的东西：
 *  1) 真的渲染出行/表头（表实例经列 meta 归一后仍与 TanStack store 是活的，不是被
 *     浅拷贝成快照——浅拷贝会在这里现形：getRowModel 失联、表格空白）；
 *  2) 项目列 meta（variant 强/弱、className 表头+单元格）落到 reui 读的那两个字段上；
 *  3) recordCount 走 `getRowCount()`（总数）而不是当前页行数——分页条的「共 N 条」
 *     取自它，传错了不会报错，只会静默显示当前页条数；
 *  4) 列显隐（reui 的上下文组件）能渲染 = 工具栏确实落在 DataTable 的 provider 内；
 *     真放到 provider 外，`useDataGrid()` 会直接抛错，下面每个用例都会红。
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
        // strong → font-medium
        expect(strongCell?.className).toContain("font-medium")
        // className → 单元格也带 tabular-nums
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
        // ui-web 兜底为 reui 自带英文，中文计数由 app-kit 的 provider 灌入；
        // 这里直接挂 provider 复现那条通道，钉住分页标签取的是总数（42）而非当前页行数。
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
