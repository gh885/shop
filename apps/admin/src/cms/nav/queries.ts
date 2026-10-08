import { message } from "#/locales/message"
import { CmsAdminApi } from "@shop/api/sdk"
import type { CmsStatus, NavRequest } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

// nav 域 queryKey 工厂 + 取数 + 写操作
const navKeys = {
    all: ["admin", "cms", "nav"] as const,
    list: (navKey: string | undefined) => ["admin", "cms", "nav", navKey ?? "all"] as const,
}

/** 导航条目列表：后端不分页，navKey 缺省 = 不筛 */
export const navListOptions = (navKey?: string) =>
    queryOptions({
        queryKey: navKeys.list(navKey),
        queryFn: () => CmsAdminApi.listAdminNav({ query: { navKey } }),
        placeholderData: (prev) => prev,
    })

export function useCreateNav() {
    return useMutation({
        mutationFn: (input: NavRequest) => CmsAdminApi.createNav({ body: input }),
        meta: {
            success: message("cms.nav.created"),
            error: message("cms.nav.failed"),
            invalidates: [navKeys.all],
        },
    })
}

export function useUpdateNav() {
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: NavRequest }) =>
            CmsAdminApi.updateNav({ path: { id }, body: input }),
        meta: {
            success: message("cms.nav.updated"),
            error: message("cms.nav.failed"),
            invalidates: [navKeys.all],
        },
    })
}

export function useSetNavStatus() {
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: CmsStatus }) =>
            CmsAdminApi.setNavStatus({ path: { id, status } }),
        meta: {
            success: message("cms.nav.statusUpdated"),
            error: message("cms.nav.statusFailed"),
            invalidates: [navKeys.all],
        },
    })
}
