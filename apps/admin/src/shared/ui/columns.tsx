import type { ReactNode } from "react"
import type { ColumnDef, RowData } from "@tanstack/react-table"
import type { DataTableFeatures } from "@shop/ui-web"

/**
 * 跨域共用的列片段（CMS 三表 + 店铺审核队列）。
 *
 * 判断口径：只有「不依赖任何一个业务对象字段」的列才放这里。操作列的右对齐与
 * `enableHiding: false` 是每个列表都要的，具体渲染什么由调用方给 `render`；
 * 一旦某个列需要知道行里有哪个字段（状态徽标、排序值），它就还留在自己域的 `list-columns` 里。
 */

/** 操作列：右对齐、不参与列显隐 */
export function actionsColumn<T extends RowData>(
    render: (row: T) => ReactNode,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "actions",
        header: "操作",
        enableHiding: false,
        meta: { className: "text-right" },
        cell: ({ row }) => <>{render(row.original)}</>,
    }
}
