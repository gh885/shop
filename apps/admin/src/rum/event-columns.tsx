import { useMemo } from "react"
import type { AdminRumEventItem } from "@shop/api/sdk"
import { TimeText } from "@shop/app-kit/display"
import { Button, type DataTableFeatures } from "@shop/ui-web"
import type { ColumnDef } from "@tanstack/react-table"
import { useT } from "#/locales/use-t"
import { APP_KEYS, KIND_KEYS } from "./constants"

/** 明细列表的列。同样的「查不到退回码本身」口径，见 `./columns` 的注释 */
function KindCell({ code }: { code: string }) {
    const t = useT()
    const key = KIND_KEYS[code]
    return <>{key ? t(key) : code}</>
}

function AppCell({ code }: { code: string }) {
    const t = useT()
    const key = APP_KEYS[code]
    return <>{key ? t(key) : code}</>
}

/** 可能为空的短字段：空给破折号而不是留白，否则一行里分不清「没有」和「没渲染出来」 */
function TextCell({ value, mono }: { value: string | null; mono?: boolean }) {
    if (!value) return <>—</>
    return (
        <span
            className={
                mono ? "block max-w-40 truncate font-mono text-xs" : "block max-w-40 truncate"
            }
            title={value}
        >
            {value}
        </span>
    )
}

/**
 * @param onOpen 点摘要那一格打开原件抽屉
 */
export function useRumEventColumns(
    onOpen: (event: AdminRumEventItem) => void,
): ColumnDef<DataTableFeatures, AdminRumEventItem>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "createdAt",
                header: t("rum.field.time"),
                meta: { variant: "muted", className: "tabular-nums whitespace-nowrap" },
                cell: ({ row }) => <TimeText iso={row.original.createdAt} />,
            },
            {
                accessorKey: "message",
                header: t("rum.field.message"),
                meta: { variant: "strong" },
                cell: ({ row }) => (
                    // 用 button 而不是 Link：它打开的是本页的抽屉，不是一次导航——写成 Link 会让
                    // 中键/新标签页打开一个不存在的地址。读屏名就是它自己那句摘要，不必再补 aria-label。
                    <Button
                        variant="ghost"
                        size="sm"
                        className="max-w-96 justify-start"
                        title={row.original.message ?? undefined}
                        onClick={() => onOpen(row.original)}
                    >
                        <span className="block truncate">
                            {row.original.message ?? t("rum.issue.noMessage")}
                        </span>
                    </Button>
                ),
            },
            {
                accessorKey: "app",
                header: t("rum.field.app"),
                cell: ({ row }) => (
                    <div className="flex flex-col">
                        <span>
                            <AppCell code={row.original.app} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                            <KindCell code={row.original.kind} />
                        </span>
                    </div>
                ),
            },
            {
                accessorKey: "name",
                header: t("rum.field.name"),
                cell: ({ row }) => <TextCell value={row.original.name} />,
            },
            {
                accessorKey: "version",
                header: t("rum.field.version"),
                meta: { variant: "muted" },
                cell: ({ row }) => (
                    <TextCell
                        value={row.original.version}
                        mono
                    />
                ),
            },
            {
                accessorKey: "route",
                header: t("rum.field.route"),
                meta: { variant: "muted" },
                cell: ({ row }) => (
                    <TextCell
                        value={row.original.route}
                        mono
                    />
                ),
            },
            {
                accessorKey: "sessionId",
                header: t("rum.field.session"),
                meta: { variant: "muted" },
                cell: ({ row }) => (
                    <TextCell
                        value={row.original.sessionId}
                        mono
                    />
                ),
            },
            {
                accessorKey: "userId",
                header: t("rum.field.user"),
                meta: { variant: "muted" },
                cell: ({ row }) => (
                    <TextCell
                        value={row.original.userId}
                        mono
                    />
                ),
            },
        ],
        [t, onOpen],
    )
}
