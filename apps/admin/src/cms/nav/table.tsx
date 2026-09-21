import { useState } from "react"
import type { NavEntryResponse } from "@shop/api/sdk"
import { PencilIcon } from "lucide-react"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge, Button, confirm, Spinner, type DataTableFeatures } from "@shop/ui-web"

import { STATUS_BADGE } from "../constants"
import { useSetNavStatus } from "./queries"
import { NavFormDialog } from "./form-dialog"

function NavActions({ entry }: { entry: NavEntryResponse }) {
    const [editOpen, setEditOpen] = useState(false)
    const enabled = entry.status === "ENABLED"
    const setStatus = useSetNavStatus()

    /** 启停二次确认：确认即改状态，失败保持打开（错误提示走全局 mutation 反馈） */
    function toggleStatus() {
        const nextStatus = enabled ? "DISABLED" : "ENABLED"
        void confirm({
            title: enabled ? `停用「${entry.title}」` : `启用「${entry.title}」`,
            description: enabled
                ? "停用后前台导航立即不再展示该条目，确认执行？"
                : "启用后前台导航展示该条目，确认执行？",
            confirmText: enabled ? "确认停用" : "确认启用",
            tone: enabled ? "destructive" : "default",
            action: () => setStatus.mutateAsync({ id: entry.id, status: nextStatus }),
        })
    }

    return (
        <div className="flex justify-end gap-2">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditOpen(true)}
            >
                <PencilIcon data-slot="icon" />
                编辑
            </Button>
            <NavFormDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                editing={entry}
            />
            <Button
                variant="outline"
                size="sm"
                disabled={setStatus.isPending}
                onClick={toggleStatus}
            >
                {setStatus.isPending && <Spinner />}
                {enabled ? "停用" : "启用"}
            </Button>
        </div>
    )
}

export const navColumns: ColumnDef<DataTableFeatures, NavEntryResponse>[] = [
    {
        accessorKey: "navKey",
        header: "导航位",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.navKey}</span>,
    },
    {
        accessorKey: "title",
        header: "标题",
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <span className="font-medium">{row.original.title}</span>
                {row.original.iconKey && <Badge variant="outline">{row.original.iconKey}</Badge>}
            </div>
        ),
    },
    {
        accessorKey: "targetType",
        header: "跳转",
        cell: ({ row }) =>
            row.original.targetType ? (
                <Badge variant="info">{row.original.targetType}</Badge>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
    },
    {
        id: "subs",
        header: "分组/词条",
        cell: ({ row }) => {
            const groups = row.original.subs
            const itemCount = groups.reduce((sum, g) => sum + (g.items?.length ?? 0), 0)
            return (
                <span className="tabular-nums text-muted-foreground">
                    {groups.length} 组 / {itemCount} 项
                </span>
            )
        },
    },
    {
        accessorKey: "sortOrder",
        header: "排序",
        cell: ({ row }) => <span className="tabular-nums">{row.original.sortOrder}</span>,
    },
    {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => {
            const badge = STATUS_BADGE[row.original.status]
            return <Badge variant={badge.variant}>{badge.label}</Badge>
        },
    },
    {
        id: "actions",
        header: () => <span className="flex justify-end">操作</span>,
        enableHiding: false,
        cell: ({ row }) => <NavActions entry={row.original} />,
    },
]
