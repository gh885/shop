import type { ReactNode } from "react"
import type { ColumnDef, RowData } from "@tanstack/react-table"
import type { DataTableFeatures } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

/**
 * 跨域共用的列片段（CMS 三表 + 店铺审核队列）。
 *
 * 判断口径：只有「不依赖任何一个业务对象字段」的列才放这里。操作列的右对齐与
 * `enableHiding: false` 是每个列表都要的，具体渲染什么由调用方给 `render`；
 * 一旦某个列需要知道行里有哪个字段（状态徽标、排序值），它就还留在自己域的 `list-columns` 里。
 */

/**
 * 操作列表头。
 *
 * 收成一个小部件而不是让调用点传 label：列定义常常落在模块级的 `xxxColumns` 常量里，
 * 那里取不到 `t`（要传就得把 CMS 三张表整体改成 hook）。表头做成组件后，句子在渲染期
 * 从 catalog 取——与各域把「状态徽标 / 生效窗口」收成组件的做法同一条道，9 处调用点零改动。
 */
function ActionsHeader() {
    const t = useT()
    return t("common.col.actions")
}

/** 操作列：右对齐、不参与列显隐 */
export function actionsColumn<T extends RowData>(
    render: (row: T) => ReactNode,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "actions",
        header: () => <ActionsHeader />,
        enableHiding: false,
        meta: { className: "text-right" },
        cell: ({ row }) => <>{render(row.original)}</>,
    }
}
