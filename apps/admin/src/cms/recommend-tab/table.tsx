import { useState } from "react"
import type { RecommendTabResponse } from "@shop/api/sdk"
import { PencilIcon } from "lucide-react"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge, Button, ConfirmDialog, Spinner, type DataTableFeatures } from "@shop/ui-web"

import { STATUS_BADGE } from "../constants"
import { useSetTabStatus } from "./queries"
import { TabFormDialog } from "./form-dialog"

function TabActions({ tab }: { tab: RecommendTabResponse }) {
    const [editOpen, setEditOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const enabled = tab.status === "ENABLED"
    const setStatus = useSetTabStatus()

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
            <TabFormDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                editing={tab}
            />
            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={enabled ? `停用词条「${tab.name}」` : `启用词条「${tab.name}」`}
                description={
                    enabled
                        ? "停用后前台推荐条立即不再展示该词条，确认执行？"
                        : "启用后前台推荐条展示该词条，确认执行？"
                }
                confirmText={enabled ? "确认停用" : "确认启用"}
                tone={enabled ? "destructive" : "default"}
                pending={setStatus.isPending}
                onConfirm={() =>
                    setStatus.mutate({
                        id: tab.id,
                        status: enabled ? "DISABLED" : "ENABLED",
                    })
                }
            />
            <Button
                variant="outline"
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setConfirmOpen(true)}
            >
                {setStatus.isPending && <Spinner />}
                {enabled ? "停用" : "启用"}
            </Button>
        </div>
    )
}

export const tabColumns: ColumnDef<DataTableFeatures, RecommendTabResponse>[] = [
    {
        accessorKey: "name",
        header: "词条",
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <span className="font-medium">{row.original.name}</span>
                {row.original.isDefault && <Badge variant="warning">猜你喜欢</Badge>}
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
        accessorKey: "target",
        header: "目标",
        cell: ({ row }) =>
            row.original.target ? (
                <span className="font-mono text-xs text-muted-foreground">
                    {row.original.target}
                </span>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
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
        cell: ({ row }) => <TabActions tab={row.original} />,
    },
]
