import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import {
    SellerShippingApi,
    type ShippingTemplateRequest,
    type ShippingTemplateResponse,
} from "@shop/api/sdk"
import { toApiError } from "@shop/common"

import { useWriteMutation } from "@shop/app-kit"

const shippingKeys = {
    all: ["shipping-template"] as const,
    detail: (shopId: string) => ["shipping-template", shopId] as const,
}

/**
 * 本店运费模板：未设置时后端 404，这不是故障，返回 null 让页面进入新建态。
 * 不用 undefined：TanStack Query 以 undefined 表示「仍在加载」，404 归零必须是显式「无数据」载荷
 */
async function getShippingTemplate(): Promise<ShippingTemplateResponse | null> {
    try {
        return await SellerShippingApi.getShippingTemplate()
    } catch (error) {
        // oxlint-disable-next-line no-null -- 见函数注释：TanStack Query 数据语义要求显式 null
        if (toApiError(error).status === 404) return null
        throw error
    }
}

const shippingTemplateOptions = (shopId: string) =>
    queryOptions({
        queryKey: shippingKeys.detail(shopId),
        queryFn: getShippingTemplate,
        // 404 已由 getShippingTemplate 归一为 null；其他错误多与权限/网络有关，失败即报（全局默认抛给路由错误页）
        retry: false,
    })

/** 运费模板：shopId 由路由守卫（ShopGate）保证必有，页面经 useShop() 取到后传入 */
export function useShippingTemplate(shopId: string) {
    return useQuery(shippingTemplateOptions(shopId))
}

export function useSaveShippingTemplate(shopId: string) {
    const queryClient = useQueryClient()

    // 保存后直接回填缓存（响应即权威数据），不走 invalidate
    return useWriteMutation<ShippingTemplateRequest, ShippingTemplateResponse>({
        // 覆盖式保存整份模板
        mutationFn: (input) => SellerShippingApi.saveShippingTemplate({ body: input }),
        onSuccess: (saved) => queryClient.setQueryData(shippingKeys.detail(shopId), saved),
        messages: { success: "运费模板已保存" },
    })
}
