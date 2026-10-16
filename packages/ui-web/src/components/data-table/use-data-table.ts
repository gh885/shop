"use client"

import { useTable, type RowData, type TableOptions } from "@tanstack/react-table"

import {
    dataTableFeatures,
    withReuiColumnMeta,
    type DataTableFeatures,
} from "./data-table-features"

type UseDataTableOptions<TData extends RowData> = Omit<
    TableOptions<DataTableFeatures, TData>,
    "features"
>

/**
 * 只提供项目的 feature 集合，不镜像/裁剪 TanStack options。manual* 与 state/onXxxChange 受控方式相互独立，回调接管的切片必须传回对应 state。
 * 服务端列表传 manual* + rowCount；跨页选中 ID 读 state.rowSelection——getSelectedRowModel() 只返回当前已加载数据，不能当跨页全集。
 */
export function useDataTable<TData extends RowData>(options: UseDataTableOptions<TData>) {
    const table = useTable({
        enableRowSelection: false,
        ...options,
        columns: withReuiColumnMeta(options.columns),
        features: dataTableFeatures,
    })

    return { table }
}
