import { message } from "#/locales/message"
import { CmsAdminApi } from "@shop/api/sdk"
import type { BannerRequest, CmsStatus } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

// banner 域 queryKey 工厂 + 取数 + 写操作（SDK 直调）
const bannerKeys = {
    all: ["admin", "cms", "banners"] as const,
    list: (slot: string | undefined) => ["admin", "cms", "banners", slot ?? "all"] as const,
}

/** 运营位列表：后端不分页的全量小表，slot 缺省 = 不筛 */
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
            success: message("admin.cms.banner.created"),
            error: message("admin.cms.banner.failed"),
            invalidates: [bannerKeys.all],
        },
    })
}

export function useUpdateBanner() {
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: BannerRequest }) =>
            CmsAdminApi.updateBanner({ path: { id }, body: input }),
        meta: {
            success: message("admin.cms.banner.updated"),
            error: message("admin.cms.banner.failed"),
            invalidates: [bannerKeys.all],
        },
    })
}

export function useSetBannerStatus() {
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: CmsStatus }) =>
            CmsAdminApi.setBannerStatus({ path: { id, status } }),
        meta: {
            success: message("admin.cms.banner.statusUpdated"),
            error: message("admin.cms.banner.statusFailed"),
            invalidates: [bannerKeys.all],
        },
    })
}
