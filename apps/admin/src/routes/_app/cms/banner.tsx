import { z } from "zod"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { BannerFormDialog } from "#/cms/banner/form-dialog"
import { bannerListOptions } from "#/cms/banner/queries"
import { bannerColumns } from "#/cms/banner/table"
import { CMS_BANNER_SLOTS, CMS_KEY_MAX } from "#/cms/constants"
import { CmsListShell } from "#/cms/list-shell"

export const Route = createFileRoute("/_app/cms/banner")({
    validateSearch: z.object({
        slot: z.string().trim().min(1).max(CMS_KEY_MAX).optional(),
    }),
    component: BannerPage,
})

function BannerPage() {
    const { slot } = Route.useSearch()
    const navigate = Route.useNavigate()

    const { data: banners = [], isPending } = useQuery(bannerListOptions(slot))

    return (
        <CmsListShell
            title="运营位 Banner"
            description="首页与频道页运营位配置；支持定时上下线窗口，停用即下线、不做物理删除"
            columns={bannerColumns}
            rows={banners}
            isPending={isPending}
            emptyContent="暂无符合条件的运营位"
            createText="新增运营位"
            filter={{
                label: "运营位",
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
