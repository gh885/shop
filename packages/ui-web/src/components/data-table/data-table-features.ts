import { metaHelper, tableFeatures, type ReactTable, type RowData } from "@tanstack/react-table"

import {
    dataGridFeatures,
    type DataGridTableInstance,
} from "src/components/reui/data-grid/data-grid"

import type { TableCellVariant } from "./../ui/table"

/**
 * 表格 feature 集：在 reui DataGrid 的 v9 feature 集之上，保留项目自己的列 meta 形状。
 *
 * 为什么是超集而不是直接用 reui 的 `dataGridFeatures`：reui 把列 meta 类型固定成
 * `DataGridColumnMeta`（`headerClassName` / `cellClassName` / …），而项目 14 处列定义写的是
 * `{ variant, className }`（`variant` 是列语义 strong/muted，见 ui/table）。两者是不同的类型
 * 槽位，`declare module` 增强也到不了 feature 里的 metaHelper——直接换 feature 集会让
 * `ColumnDef<DataTableFeatures, X>[]` 里的 `{ variant }` 全部报「未知属性」。
 * 所以这里铺开 reui 的 feature 注册（多出列宽/列 pin/行 pin/行展开/单元格选择/虚拟化所需），
 * 只把 columnMeta 换成本项目的形状，列定义一个字都不用改。
 *
 * 渲染时由 `DataTable` 把 `{variant, className}` 归一成 reui 读的
 * `{headerClassName, cellClassName}`（见 data-table.tsx 的 normalizeColumnMeta）。
 */
export const dataTableFeatures = tableFeatures({
    ...dataGridFeatures,
    columnMeta: metaHelper<{
        /** 列语义（strong 标识列 / muted 次要列），归一成单元格的字体/弱化色 */
        variant?: TableCellVariant
        /** 表头与单元格同时生效（`text-right`、`tabular-nums`、`font-mono text-xs`…） */
        className?: string
    }>(),
})

export type DataTableFeatures = typeof dataTableFeatures

/**
 * 把项目 feature 集的表实例交给 reui 组件（DataGrid / DataGridColumnVisibility）。
 *
 * v9 的 `TFeatures` 是 invariant，而项目的 feature 集只是在 reui 的 `dataGridFeatures` 上换掉了
 * `columnMeta` 槽位——结构上转不过去，只能显式收窄。收在唯一一处，调用点不必各写一遍双断言
 * （reui 内部对 DataGrid 也是这么宽化的）。
 */
export function asDataGridTable<TData extends RowData>(
    table: ReactTable<DataTableFeatures, TData>,
): DataGridTableInstance<TData> {
    return table as unknown as DataGridTableInstance<TData>
}

/** 列语义 → 单元格类，与 ui/table 的 tableCellVariants 保持一致（强标识列加粗、次要列弱化） */
const VARIANT_CELL_CLASS: Record<string, string> = {
    strong: "font-medium",
    muted: "text-muted-foreground",
}

/**
 * 把项目列 meta 归一成 reui DataGrid 读的那两个字段：variant 落成单元格类，
 * className 拆进 headerClassName 与 cellClassName。在建表前对列数组做一次映射即可——
 * 列 meta 是低频变更，不值得为它上 memo，但必须在 useTable 之前做完：reui 的
 * DataGridTable 读列走 getStart/Center/RightVisibleLeafColumns，不是 getAllColumns，
 * 建表后再去改表实例上的列访问器是改不动的。
 */
export function withReuiColumnMeta<TColumnDef extends { meta?: Record<string, unknown> }>(
    columns: readonly TColumnDef[],
): TColumnDef[] {
    return columns.map((column) => {
        const meta = column.meta as { variant?: TableCellVariant; className?: string } | undefined
        const variantClass = meta?.variant ? VARIANT_CELL_CLASS[meta.variant] : undefined
        const shared = [meta?.className, variantClass].filter(Boolean).join(" ") || undefined
        if (!shared && !meta?.className) return column
        return {
            ...column,
            meta: {
                ...meta,
                cellClassName: shared,
                headerClassName: meta?.className,
            },
        }
    })
}
