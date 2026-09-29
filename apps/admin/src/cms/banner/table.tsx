import type { BannerResponse } from "@shop/api/sdk"

import type { ColumnDef } from "@tanstack/react-table"
import { Image, type DataTableFeatures } from "@shop/ui-web"
import { useI18n } from "@shop/app-kit"

import { codeColumn, cmsStatusColumn, sortOrderColumn, targetTypeColumn } from "../list-columns"
import { bannerWindowText } from "../display"
import { actionsColumn } from "#/shared/ui/columns"
import { CmsRowActions } from "../row-actions"
import { useSetBannerStatus } from "./queries"
import { BannerFormDialog } from "./form-dialog"

/**
 * 生效窗口那一格：列定义是模块级数组、`cell` 不是组件，所以语言只能由这个小组件订阅
 * （切语言时它必然重画，读装配级 scope 则不保证）。折文案的规则本身仍在 `../display`（可在 node 测）。
 */
function BannerWindowCell({ startAt, endAt }: { startAt: string | null; endAt: string | null }) {
    const { locale } = useI18n()
    return bannerWindowText(startAt, endAt, locale)
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
        meta: { variant: "muted", className: "tabular-nums" },
        cell: ({ row }) => (
            <BannerWindowCell
                startAt={row.original.startAt}
                endAt={row.original.endAt}
            />
        ),
    },
    sortOrderColumn(),
    cmsStatusColumn(),
    actionsColumn((banner) => <BannerActions banner={banner} />),
]
