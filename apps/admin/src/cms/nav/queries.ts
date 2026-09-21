import { CmsAdminApi } from "@shop/api/sdk"
import type { CmsStatus, NavRequest } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

// nav 域 queryKey 工厂 + 取数 + 写操作
export const navKeys = {
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

function useNavMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>, success: string) {
    return useMutation({
        mutationFn,
        meta: { success, error: "导航保存失败", invalidates: [navKeys.all] },
    })
}

export function useCreateNav() {
    return useNavMutation(
        (input: NavRequest) => CmsAdminApi.createNav({ body: input }),
        "导航条目已创建",
    )
}

export function useUpdateNav() {
    return useNavMutation(
        ({ id, input }: { id: string; input: NavRequest }) =>
            CmsAdminApi.updateNav({ path: { id }, body: input }),
        "导航条目已更新",
    )
}

export function useSetNavStatus() {
    return useNavMutation(
        ({ id, status }: { id: string; status: CmsStatus }) =>
            CmsAdminApi.setNavStatus({ path: { id, status } }),
        "导航状态已更新",
    )
}
