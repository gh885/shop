import { useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { TimeText } from "@shop/app-kit/display"
import type { DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { AppKindCell } from "./cells"
import { RUM_EVENT_PAGE_SIZE } from "./constants"
import type { RumIssueRow } from "./queries"

/**
 * 问题列表的列。
 *
 * **没有任何一列可排序**：这一页的顺序就是它的结论——后端固定按「影响会话数」降序
 * （见 `frontend-monitoring.md`：次数是噪声，影响面才是问题）。给人一个按次数排的开关
 * 等于把那条判据交回给看的人，而他本来就是来看「哪些最要紧」的。
 * 仓库的服务端表格也一律 `manualSorting`（没有排序接口），这里不破例。
 */

export function useRumIssueColumns(): ColumnDef<DataTableFeatures, RumIssueRow>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "message",
                header: t("rum.field.message"),
                meta: { variant: "strong" },
                cell: ({ row }) => (
                    // 整行的入口挂在摘要上而不是给行加 onClick：链接可以被新标签页打开、能被读屏念出来，
                    // 「点一行」的点击区也是它。同一个指纹落在两个端上时 app 必须一起带上，否则点进去混在一起。
                    <Link
                        to="/rum/events"
                        search={{
                            fingerprint: row.original.fingerprint,
                            app: row.original.app,
                            page: 1,
                            size: RUM_EVENT_PAGE_SIZE,
                        }}
                        className="block max-w-96 truncate underline-offset-4 hover:underline"
                        title={row.original.message ?? row.original.fingerprint}
                    >
                        {row.original.message ?? t("rum.issue.noMessage")}
                    </Link>
                ),
            },
            {
                accessorKey: "sessions",
                header: t("rum.field.sessions"),
                meta: { variant: "strong", className: "tabular-nums whitespace-nowrap" },
            },
            {
                accessorKey: "events",
                header: t("rum.field.events"),
                meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
            },
            {
                accessorKey: "app",
                header: t("rum.field.app"),
                cell: ({ row }) => (
                    <AppKindCell
                        app={row.original.app}
                        kind={row.original.kind}
                    />
                ),
            },
            {
                accessorKey: "route",
                header: t("rum.field.route"),
                meta: { variant: "muted", className: "font-mono text-xs" },
                cell: ({ row }) =>
                    row.original.route ? (
                        <span
                            className="block max-w-64 truncate"
                            title={row.original.route}
                        >
                            {row.original.route}
                        </span>
                    ) : (
                        "—"
                    ),
            },
            {
                accessorKey: "firstSeen",
                header: t("rum.field.firstSeen"),
                meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
                cell: ({ row }) => <TimeText iso={row.original.firstSeen} />,
            },
            {
                accessorKey: "lastSeen",
                header: t("rum.field.lastSeen"),
                meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
                cell: ({ row }) => <TimeText iso={row.original.lastSeen} />,
            },
        ],
        [t],
    )
}
