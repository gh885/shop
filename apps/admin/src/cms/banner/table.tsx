import { useMemo } from "react"
import type { BannerResponse } from "@shop/api/sdk"

import type { ColumnDef } from "@tanstack/react-table"
import { Image, type DataTableFeatures } from "@shop/ui-web"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { codeColumn, cmsStatusColumn, sortOrderColumn, targetTypeColumn } from "../list-columns"
import { bannerWindowText } from "../display"
import { actionsColumn } from "#/shared/ui/columns"
import { CmsRowActions } from "../row-actions"
import { useSetBannerStatus } from "./queries"
import { BannerFormDialog } from "./form-dialog"

function BannerWindowCell({ startAt, endAt }: { startAt: string | null; endAt: string | null }) {
    const { locale } = useI18n()
    const t = useT()
    return bannerWindowText(startAt, endAt, locale, t)
}

function BannerActions({ banner }: { banner: BannerResponse }) {
    const t = useT()
    const setStatus = useSetBannerStatus()

    return (
        <CmsRowActions
            row={banner}
            status={banner.status}
            label={banner.title}
            hints={{
                disable: t("cms.banner.disableHint"),
                enable: t("cms.banner.enableHint"),
            }}
            pending={setStatus.isPending}
            submit={(status) => setStatus.mutateAsync({ id: banner.id, status })}
            Dialog={BannerFormDialog}
        />
    )
}

export function useBannerColumns(): ColumnDef<DataTableFeatures, BannerResponse>[] {
    const t = useT()
    return useMemo(
        () => [
            {
                accessorKey: "imageUrl",
                header: t("cms.banner.col.image"),
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
            codeColumn("slot", t("cms.field.slot"), (banner) => banner.slot),
            {
                accessorKey: "title",
                header: t("cms.field.title"),
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
            targetTypeColumn(t("cms.col.targetType")),
            {
                accessorKey: "startAt",
                header: t("cms.banner.col.window"),
                meta: { variant: "muted", className: "tabular-nums" },
                cell: ({ row }) => (
                    <BannerWindowCell
                        startAt={row.original.startAt}
                        endAt={row.original.endAt}
                    />
                ),
            },
            sortOrderColumn(t("cms.col.sortOrder")),
            cmsStatusColumn(t("cms.col.status")),
            actionsColumn((banner) => <BannerActions banner={banner} />),
        ],
        [t],
    )
}
