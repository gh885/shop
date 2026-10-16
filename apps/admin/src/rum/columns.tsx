import { useMemo } from "react"
import { Link } from "@tanstack/react-router"
import { TimeText } from "@shop/app-kit/display"
import type { DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { AppKindCell } from "./cells"
import { RUM_EVENT_PAGE_SIZE } from "./constants"
import type { RumIssueRow } from "./queries"

// 不给任何列加排序：后端固定按影响会话数降序（次数是噪声，影响面才是问题），加个按次数排的开关就是把这条判据交回看的人
export function useRumIssueColumns(): ColumnDef<DataTableFeatures, RumIssueRow>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "message",
                header: t("rum.field.message"),
                meta: { variant: "strong" },
                cell: ({ row }) => (
                    // search 必须带上 app：同一指纹落在两个端上是两个问题，只按 fingerprint 筛会把两端的明细混在一起
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
