import { message } from "#/locales/message"
import { CmsAdminApi } from "@shop/api/sdk"
import type { BannerRequest, CmsStatus } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

const bannerKeys = {
    all: ["cms", "banners"] as const,
    list: (slot: string | undefined) => ["cms", "banners", slot ?? "all"] as const,
}

export const bannerListOptions = (slot?: string) =>
    queryOptions({
        queryKey: bannerKeys.list(slot),
        queryFn: () => CmsAdminApi.listAdminBanners({ query: { slot } }),
        placeholderData: (prev) => prev,
    })

export function useCreateBanner() {
    return useMutation({
        mutationFn: (input: BannerRequest) => CmsAdminApi.createBanner({ body: input }),
        meta: {
            success: message("cms.banner.created"),
            error: message("cms.banner.failed"),
            invalidates: [bannerKeys.all],
        },
    })
}

export function useUpdateBanner() {
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: BannerRequest }) =>
            CmsAdminApi.updateBanner({ path: { id }, body: input }),
        meta: {
            success: message("cms.banner.updated"),
            error: message("cms.banner.failed"),
            invalidates: [bannerKeys.all],
        },
    })
}

export function useSetBannerStatus() {
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: CmsStatus }) =>
            CmsAdminApi.setBannerStatus({ path: { id, status } }),
        meta: {
            success: message("cms.banner.statusUpdated"),
            error: message("cms.banner.statusFailed"),
            invalidates: [bannerKeys.all],
        },
    })
}
