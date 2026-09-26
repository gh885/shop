"use client"

import type { ReactNode } from "react"
import type { ReactTable, RowData } from "@tanstack/react-table"

import { DataGrid, DataGridContainer } from "src/components/reui/data-grid/data-grid"
import { DataGridPagination } from "src/components/reui/data-grid/data-grid-pagination"
import { DataGridTable } from "src/components/reui/data-grid/data-grid-table"
import type { DataGridI18nOverrides } from "src/components/reui/data-grid/data-grid-i18n"
import { Empty, EmptyHeader, EmptyTitle } from "src/components/ui/empty"
import { Skeleton } from "src/components/ui/skeleton"

import { TableShell } from "./table-shell"

import { asDataGridTable, type DataTableFeatures } from "./data-table-features"
/**
 * reui DataGrid 的中文文案。
 *
 * reui 的默认标签全英文（见 reui/data-grid/data-grid-i18n.tsx），而 `i18n` 是 DataGrid 的
 * prop、分页与列显隐又从 provider 读它——所以整个项目只在这里覆写一次，调用点不重复传。
 */
const dataGridZhI18n: DataGridI18nOverrides = {
    labels: {
        sortAscending: "升序",
        sortDescending: "降序",
        columnsMenu: "列",
        toggleColumns: "显示列",
        pinColumnStart: "固定到左侧",
        pinColumnEnd: "固定到右侧",
        moveColumnStart: "移到左侧",
        moveColumnEnd: "移到右侧",
        unpinColumn: (title) => `取消固定「${title}」列`,
        rowCreate: "新增行",
        pinRow: "固定行",
        unpinRow: "取消固定行",
        selectRow: "选择该行",
        selectAll: "全选",
        expandRow: "展开",
        collapseRow: "收起",
        dragToReorder: "拖动排序",
        dragToReorderRow: "拖动调整行序",
        reorderingUnavailable: "当前不可排序",
        loading: "正在加载列表",
        empty: "暂无数据",
        allRowsLoaded: "已加载全部",
        rowsPerPage: "每页",
        paginationInfo: ({ from, to, count }) => `第 ${from}-${to} 条 · 共 ${count} 条`,
        previousPage: "上一页",
        nextPage: "下一页",
        goToPage: (page) => `第 ${page} 页`,
        paginationEllipsis: "…",
        filterSelectedCount: (count) => `已选 ${count} 项`,
        filterNoResults: "无匹配结果",
        filterClear: "清除筛选",
    },
}

type DataTableProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
    /** 空态文案/节点，默认「暂无数据」；会包进 Empty（DESIGN.md §8） */
    emptyContent?: ReactNode
    /** 列表段内容：工具栏 + 骨架或表卡。两者都是 DOM 兄弟，间距仍由调用点的 space-y 管 */
    children?: ReactNode
}

/**
 * 列表段的上下文与项目默认值。**不渲染 DOM**（reui 的 DataGrid 就是一层 context provider），
 * 所以它可以包在工具栏与表卡外面，同时不打扰调用点的布局。
 *
 * 为什么必须包住工具栏：reui 的列显隐（DataTableViewOptions）与分页条都走 `useDataGrid()`
 * 读表实例与中文标签，只有落在 provider 内才渲染得出来。这也是「分页/列显隐不再手写」的
 * 前提——布局顺序反过来，第三方组件才有地方挂。
 *
 * recordCount 传 `table.getRowCount()`（不是当前页行数）：reui 把它当**总数**用，
 * 分页条的 from/to/共 N 条全取自它（reui/data-grid/data-grid-pagination.tsx）。
 * 取数仍不在这里：分页/排序/筛选的 state 与 manual* 由调用点经 `useDataTable` 传入。
 *
 * reui 的入口只在本目录（与 data-table-features.ts）直接引，不经 @shop/ui-web 再转一手：
 * 组装这张表用到的积木就是这里 + 分页/列显隐/表体四个文件；column-filter / scroll-area /
 * dnd / virtual / cellSelection 没接，`tableLayout` 里也全是默认的 false。
 */
export function DataTable<TData extends RowData>({
    table,
    emptyContent = "暂无数据",
    children,
}: DataTableProps<TData>) {
    return (
        <DataGrid
            table={asDataGridTable(table)}
            recordCount={table.getRowCount()}
            emptyMessage={
                <Empty className="py-4">
                    <EmptyHeader>
                        <EmptyTitle>{emptyContent}</EmptyTitle>
                    </EmptyHeader>
                </Empty>
            }
            i18n={dataGridZhI18n}
        >
            {children}
        </DataGrid>
    )
}

/** 表卡：项目外壳（TableShell）+ reui 表体与分页条。必须渲染在 `DataTable` 内。 */
export function DataTableCard({ className }: { className?: string }) {
    return (
        <TableShell
            className={className}
            footer={<DataGridPagination sizes={[10, 20, 30, 40, 50]} />}
        >
            <DataGridContainer>
                <DataGridTable />
            </DataGridContainer>
        </TableShell>
    )
}

/** query 调用处选择骨架或数据，不把 isPending 传入数据表。 */
export function DataTableSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
    return (
        <TableShell>
            <output className="sr-only">正在加载列表</output>
            <table className="w-full caption-bottom text-sm">
                <tbody>
                    {Array.from({ length: rows }, (_, row) => (
                        <tr key={row}>
                            {Array.from({ length: columns }, (_, column) => (
                                <td
                                    key={column}
                                    className="p-2"
                                >
                                    <Skeleton className="h-4 w-full" />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </TableShell>
    )
}
