"use client"

import { useTable, type RowData, type TableOptions } from "@tanstack/react-table"

import { dataTableFeatures, type DataTableFeatures } from "./data-table-features"

export type UseDataTableOptions<TData extends RowData> = Omit<
    TableOptions<DataTableFeatures, TData>,
    "features"
>

/**
 * 只提供项目的 feature 集合，不再镜像或裁剪 TanStack 的 options。
 * manual* 决定在哪处理数据，与 state/onXxxChange 的受控方式相互独立。
 * 回调接管的切片必须传回对应 state；分页、筛选、选择、列显隐同理。
 *
 * 服务端列表传 manualPagination/manualSorting/manualFiltering + rowCount。
 * 选择需 enableRowSelection + 稳定 getRowId；跨页选中 ID 读 state.rowSelection，
 * getSelectedRowModel() 只能返回当前已加载的数据，不能当成跨页选中全集。
 */
export function useDataTable<TData extends RowData>(options: UseDataTableOptions<TData>) {
    const table = useTable({
        enableRowSelection: false,
        ...options,
        features: dataTableFeatures,
    })

    return { table }
}
