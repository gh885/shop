import { CmsAdminApi } from "@shop/api/sdk"
import type { BannerRequest, CmsStatus } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

// banner 域 queryKey 工厂 + 取数 + 写操作（SDK 直调）
export const bannerKeys = {
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

function useBannerMutation<TInput>(
    mutationFn: (input: TInput) => Promise<unknown>,
    success: string,
) {
    return useMutation({
        mutationFn,
        meta: { success, error: "运营位保存失败", invalidates: [bannerKeys.all] },
    })
}

export function useCreateBanner() {
    return useBannerMutation(
        (input: BannerRequest) => CmsAdminApi.createBanner({ body: input }),
        "运营位已创建",
    )
}

export function useUpdateBanner() {
    return useBannerMutation(
        ({ id, input }: { id: string; input: BannerRequest }) =>
            CmsAdminApi.updateBanner({ path: { id }, body: input }),
        "运营位已更新",
    )
}

export function useSetBannerStatus() {
    return useBannerMutation(
        ({ id, status }: { id: string; status: CmsStatus }) =>
            CmsAdminApi.setBannerStatus({ path: { id, status } }),
        "运营位状态已更新",
    )
}
