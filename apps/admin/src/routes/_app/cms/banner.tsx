import { z } from "zod"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { BannerFormDialog } from "#/cms/banner/form-dialog"
import { bannerListOptions } from "#/cms/banner/queries"
import { useBannerColumns } from "#/cms/banner/table"
import { CMS_BANNER_SLOTS, CMS_KEY_MAX } from "#/cms/constants"
import { CmsListShell } from "#/cms/list-shell"
import { useT } from "#/locales/use-t"

export const Route = createFileRoute("/_app/cms/banner")({
    validateSearch: z.object({
        slot: z.string().trim().min(1).max(CMS_KEY_MAX).optional(),
    }),
    component: BannerPage,
})

function BannerPage() {
    const t = useT()
    const { slot } = Route.useSearch()
    const navigate = Route.useNavigate()

    const { data: banners = [], isPending } = useQuery(bannerListOptions(slot))
    const columns = useBannerColumns()

    return (
        <CmsListShell
            title={t("admin.cms.banner.page.title")}
            description={t("admin.cms.banner.page.description")}
            columns={columns}
            rows={banners}
            isPending={isPending}
            emptyContent={t("admin.cms.banner.page.empty")}
            createText={t("admin.cms.banner.create")}
            filter={{
                label: t("admin.cms.field.slot"),
                value: slot,
                options: CMS_BANNER_SLOTS,
                onChange: (next) => void navigate({ search: { slot: next } }),
            }}
            renderCreate={({ open, onOpenChange }) => (
                <BannerFormDialog
                    open={open}
                    onOpenChange={onOpenChange}
                    defaultSlot={slot}
                />
            )}
        />
    )
}
