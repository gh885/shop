import { metaHelper, tableFeatures, type ReactTable, type RowData } from "@tanstack/react-table"

import {
    dataGridFeatures,
    type DataGridTableInstance,
} from "src/components/reui/data-grid/data-grid"

import type { TableCellVariant } from "./../ui/table"

/** 在 reui dataGridFeatures 之上只替换 columnMeta 槽位为项目形状：reui 把列 meta 固定成 DataGridColumnMeta，与项目 14 处 {variant,className} 列定义类型不兼容，直接换 feature 集会全线报「未知属性」 */
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

/** v9 的 TFeatures 是 invariant，项目 feature 集只换了 columnMeta 槽位、结构上转不过去；显式收窄收在这一处，调用点不重复写双断言 */
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

/** 把项目列 meta 归一成 reui 读的 headerClassName/cellClassName（variant 落成单元格类）。必须在 useTable 之前做完——reui 读列走 getStart/Center/RightVisibleLeafColumns 而非 getAllColumns，建表后改不动列访问器 */
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
