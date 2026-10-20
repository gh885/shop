import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { BannerFormDialog } from "#/domains/cms/banner/form-dialog"
import { bannerListOptions } from "#/domains/cms/banner/queries"
import { bannerSearchSchema } from "#/domains/cms/banner/search"
import { useBannerColumns } from "#/domains/cms/banner/table"
import { CMS_BANNER_SLOTS } from "#/domains/cms/constants"
import { CmsListShell } from "#/domains/cms/list-shell"
import { useT } from "#/locales/use-t"

export const Route = createFileRoute("/_app/cms/banner")({
    validateSearch: bannerSearchSchema,
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
            title={t("cms.banner.page.title")}
            description={t("cms.banner.page.description")}
            columns={columns}
            rows={banners}
            isPending={isPending}
            emptyContent={t("cms.banner.page.empty")}
            createText={t("cms.banner.create")}
            filter={{
                label: t("cms.field.slot"),
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
