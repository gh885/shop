import { message } from "#/locales/message"
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import {
    SellerShippingApi,
    type ShippingTemplateRequest,
    type ShippingTemplateResponse,
} from "@shop/api/sdk"
import { toApiError } from "@shop/common/contract"
const shippingKeys = {
    all: ["shipping-template"] as const,
    detail: (shopId: string) => [...shippingKeys.all, shopId] as const,
}

// 404 = 本店还没配模板，返回 null 进新建态；不能用 undefined——TanStack 拿它表示「仍在加载」
async function getShippingTemplate(): Promise<ShippingTemplateResponse | null> {
    try {
        return await SellerShippingApi.getShippingTemplate()
    } catch (error) {
        // oxlint-disable-next-line no-null -- 见函数注释：TanStack Query 数据语义要求显式 null
        if (toApiError(error).status === 404) return null
        throw error
    }
}

export const shippingTemplateOptions = (shopId: string) =>
    queryOptions({
        queryKey: shippingKeys.detail(shopId),
        queryFn: getShippingTemplate,
        // 404 已由 getShippingTemplate 归一为 null；其他错误多与权限/网络有关，失败即报（全局默认抛给路由错误页）
        retry: false,
    })

export function useSaveShippingTemplate(shopId: string) {
    const queryClient = useQueryClient()

    // 保存后直接回填缓存（响应即权威数据），不走 invalidate
    return useMutation({
        mutationFn: (input: ShippingTemplateRequest) =>
            SellerShippingApi.saveShippingTemplate({ body: input }),
        meta: { success: message("shipping.toast.saved") },
        onSuccess: (saved) => queryClient.setQueryData(shippingKeys.detail(shopId), saved),
    })
}
