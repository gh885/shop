import type { CmsStatus } from "@shop/api/sdk"
import type { ColumnDef, RowData } from "@tanstack/react-table"
import { Badge, type DataTableFeatures } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { STATUS_BADGE } from "./constants"

/**
 * CMS 三张列表（导航 / 运营位 / 词条）共用的列片段。
 *
 * 三张表的列原本逐字抄了三份：中间几列确实是各自的业务（分组、生效窗口、默认词条），
 * 但状态徽标 / 排序 / 跳转类型 / 右对齐操作列是同一套展示口径，抄三处就变成三个真相
 * ——比如「已停用」的措辞改一次要记得改三个文件。
 *
 * 一律用 `id` + 读 `row.original`：这些列都不参与排序与筛选（后端按 sortOrder 返回全量），
 * 挂 accessorKey 只是给 TanStack 一个它用不上的取值路径。
 *
 * 操作列不在这里：它不认任何业务字段，已经上收到 `#/shared/ui/columns`，和审核队列共用一份。
 */

/** ENABLED / DISABLED 两态徽标：句子在本端 catalog，取 `t` 只能落在组件里 */
function CmsStatusBadge({ status }: { status: CmsStatus }) {
    const t = useT()
    const badge = STATUS_BADGE[status]
    return <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
}

/** 状态列：ENABLED / DISABLED 两态徽标；表头是用户可见文案，由调用点（列 hook）传已翻译串 */
export function cmsStatusColumn<T extends { status: CmsStatus }>(
    header: string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "status",
        header,
        cell: ({ row }) => <CmsStatusBadge status={row.original.status} />,
    }
}

/** 排序列：等宽数字；后端已按它排好，不做表头排序 */
export function sortOrderColumn<T extends { sortOrder: number }>(
    header: string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "sortOrder",
        header,
        meta: { className: "tabular-nums" },
        cell: ({ row }) => row.original.sortOrder,
    }
}

/** 跳转类型列：未配置给占位破折号，整列不隐藏 */
export function targetTypeColumn<T extends { targetType: string | null }>(
    header: string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "targetType",
        header,
        cell: ({ row }) =>
            row.original.targetType ? (
                <Badge variant="info">{row.original.targetType}</Badge>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
    }
}

/** 跳转目标列：ID / 搜索词 / URL 都是机器可读串，等宽小字 */
export function targetColumn<T extends { target: string | null }>(
    header: string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id: "target",
        header,
        cell: ({ row }) =>
            row.original.target ? (
                <span className="font-mono text-xs text-muted-foreground">
                    {row.original.target}
                </span>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
    }
}

/** 机器标识列（导航位 / 运营位）：等宽小字，无次要色——它是这行的主键之一 */
export function codeColumn<T extends RowData>(
    id: string,
    header: string,
    value: (row: T) => string,
): ColumnDef<DataTableFeatures, T> {
    return {
        id,
        header,
        cell: ({ row }) => <span className="font-mono text-xs">{value(row.original)}</span>,
    }
}
