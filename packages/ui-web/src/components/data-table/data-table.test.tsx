import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DataTable, useDataTable } from "./index"

/**
 * DataTable 渲染器的接线测试。两个要钉住的东西：
 *  1) 真的渲染出行/表头（表实例经列 meta 归一后仍与 TanStack store 是活的，不是被
 *     浅拷贝成快照——浅拷贝会在这里现形：getRowModel 失联、表格空白）；
 *  2) 项目列 meta（variant 强/弱、className 表头+单元格）落到 reui 读的那两个字段上。
 */
type Row = { id: string; name: string; qty: number }

const rows: Row[] = [
    { id: "1", name: "甲", qty: 12 },
    { id: "2", name: "乙", qty: 7 },
]

function Harness() {
    const { table } = useDataTable<Row>({
        data: rows,
        getRowId: (r) => r.id,
        columns: [
            { accessorKey: "name", header: "名称", meta: { variant: "strong" } },
            { accessorKey: "qty", header: "数量", meta: { className: "tabular-nums" } },
        ],
    })
    return <DataTable table={table} />
}

describe("DataTable", () => {
    it("渲染全部数据行（表实例未被浅拷贝成死快照）", () => {
        render(<Harness />)

        expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument()
        const body = screen.getAllByRole("row").filter((r) => !r.hasAttribute("role"))
        // 表头行 + 2 行数据
        expect(body.length).toBeGreaterThanOrEqual(3)
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
        function EmptyHarness() {
            const { table } = useDataTable<Row>({ data: [], getRowId: (r) => r.id, columns: [] })
            return (
                <DataTable
                    table={table}
                    emptyContent="空空如也"
                />
            )
        }
        render(<EmptyHarness />)

        expect(within(document.body).getByText("空空如也")).toBeInTheDocument()
    })
})
