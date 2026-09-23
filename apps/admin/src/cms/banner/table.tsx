import { useState } from "react"
import type { BannerResponse } from "@shop/api/sdk"
import { formatTimeShort } from "@shop/app-kit"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge, Button, confirm, Image, Spinner, type DataTableFeatures } from "@shop/ui-web"
import { PencilIcon } from "lucide-react"

import { STATUS_BADGE } from "../constants"
import { useSetBannerStatus } from "./queries"
import { BannerFormDialog } from "./form-dialog"

/** 生效窗口：双空 = 立即上线、长期有效 */
const windowText = (startAt: string | null, endAt: string | null) => {
    if (!startAt && !endAt) return "立即 · 长期"
    return `${startAt ? formatTimeShort(startAt) : "立即"} ~ ${endAt ? formatTimeShort(endAt) : "长期"}`
}

function BannerActions({ banner }: { banner: BannerResponse }) {
    const [editOpen, setEditOpen] = useState(false)
    const enabled = banner.status === "ENABLED"
    const nextStatus = enabled ? "DISABLED" : "ENABLED"
    const setStatus = useSetBannerStatus()

    /** 启停二次确认：确认即改状态，失败保持打开（错误提示走全局 mutation 反馈） */
    function toggleStatus() {
        void confirm({
            title: enabled ? `停用「${banner.title}」` : `启用「${banner.title}」`,
            description: enabled
                ? "停用后前台立即不再展示该运营位，确认执行？"
                : "启用后按生效时间窗口在前台展示，确认执行？",
            confirmText: enabled ? "确认停用" : "确认启用",
            tone: enabled ? "destructive" : "default",
            action: () => setStatus.mutateAsync({ id: banner.id, status: nextStatus }),
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
            <BannerFormDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                editing={banner}
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

export const bannerColumns: ColumnDef<DataTableFeatures, BannerResponse>[] = [
    {
        accessorKey: "imageUrl",
        header: "图片",
        enableHiding: false,
        cell: ({ row }) => (
            <Image
                src={row.original.imageUrl}
                alt={row.original.title}
                radius="md"
                className="h-10 w-20"
            />
        ),
    },
    {
        accessorKey: "slot",
        header: "运营位",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.slot}</span>,
    },
    {
        accessorKey: "title",
        header: "标题",
        cell: ({ row }) => (
            <div className="min-w-0">
                <div className="truncate font-medium">{row.original.title}</div>
                {row.original.subtitle && (
                    <div className="truncate text-xs text-muted-foreground">
                        {row.original.subtitle}
                    </div>
                )}
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
        accessorKey: "startAt",
        header: "生效窗口",
        cell: ({ row }) => (
            <span className="text-xs tabular-nums text-muted-foreground">
                {windowText(row.original.startAt, row.original.endAt)}
            </span>
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
        cell: ({ row }) => <BannerActions banner={row.original} />,
    },
]
