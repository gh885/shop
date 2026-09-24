import type { BannerResponse } from "@shop/api/sdk"
import { formatTimeShort } from "@shop/app-kit"

import type { ColumnDef } from "@tanstack/react-table"
import { Image, type DataTableFeatures } from "@shop/ui-web"

import { codeColumn, cmsStatusColumn, sortOrderColumn, targetTypeColumn } from "../list-columns"
import { actionsColumn } from "#/shared/ui/columns"
import { CmsRowActions } from "../row-actions"
import { useSetBannerStatus } from "./queries"
import { BannerFormDialog } from "./form-dialog"

/** 生效窗口：双空 = 立即上线、长期有效 */
const windowText = (startAt: string | null, endAt: string | null) => {
    if (!startAt && !endAt) return "立即 · 长期"
    return `${startAt ? formatTimeShort(startAt) : "立即"} ~ ${endAt ? formatTimeShort(endAt) : "长期"}`
}

function BannerActions({ banner }: { banner: BannerResponse }) {
    const setStatus = useSetBannerStatus()

    return (
        <CmsRowActions
            row={banner}
            status={banner.status}
            label={banner.title}
            hints={{
                disable: "停用后前台立即不再展示该运营位，确认执行？",
                enable: "启用后按生效时间窗口在前台展示，确认执行？",
            }}
            pending={setStatus.isPending}
            submit={(status) => setStatus.mutateAsync({ id: banner.id, status })}
            Dialog={BannerFormDialog}
        />
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
    codeColumn("slot", "运营位", (banner) => banner.slot),
    {
        accessorKey: "title",
        header: "标题",
        cell: ({ row }) => (
            <div
                className="max-w-60"
                title={row.original.title}
            >
                <div className="truncate font-medium">{row.original.title}</div>
                {row.original.subtitle && (
                    <div className="truncate text-xs text-muted-foreground">
                        {row.original.subtitle}
                    </div>
                )}
            </div>
        ),
    },
    targetTypeColumn(),
    {
        accessorKey: "startAt",
        header: "生效窗口",
        cell: ({ row }) => (
            <span className="text-xs tabular-nums text-muted-foreground">
                {windowText(row.original.startAt, row.original.endAt)}
            </span>
        ),
    },
    sortOrderColumn(),
    cmsStatusColumn(),
    actionsColumn((banner) => <BannerActions banner={banner} />),
]
