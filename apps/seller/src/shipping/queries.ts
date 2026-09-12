import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ShippingTemplateRequest } from "@shop/api/sdk"

import { useCurrentShop } from "#/shop"
import { useWriteMutation } from "#/shared/lib/use-write-mutation"
import { getShippingTemplate, saveShippingTemplate, type ShippingTemplate } from "./data"

export const shippingKeys = {
    all: ["shipping-template"] as const,
    detail: (shopId: string | undefined) => ["shipping-template", shopId] as const,
}

const shippingTemplateOptions = (shopId: string | undefined) =>
    queryOptions({
        queryKey: shippingKeys.detail(shopId),
        queryFn: getShippingTemplate,
        enabled: Boolean(shopId),
        // 404 已由 data.ts 归一为 null；其他错误多与权限/网络有关，重试只在用户点刷新时发生
        retry: false,
    })

export function useShippingTemplate() {
    const shop = useCurrentShop()
    return useQuery(shippingTemplateOptions(shop?.id))
}

export function useSaveShippingTemplate() {
    const queryClient = useQueryClient()
    const shopId = useCurrentShop()?.id

    // 保存后直接回填缓存（响应即权威数据），不走 invalidate
    return useWriteMutation<ShippingTemplateRequest, ShippingTemplate>({
        mutationFn: saveShippingTemplate,
        onSuccess: (saved) => queryClient.setQueryData(shippingKeys.detail(shopId), saved),
        messages: { success: "运费模板已保存" },
    })
}
