import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ShippingTemplateRequest, ShippingTemplateResponse } from "@shop/api/sdk"

import { useCurrentShop } from "#/shop"
import { useWriteMutation } from "@shop/app-kit"
import { getShippingTemplate, saveShippingTemplate } from "./data"

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
    const queryClient = useQueryClient()
    const shopId = shop?.id
    const options = shippingTemplateOptions(shopId)
    return {
        ...useQuery(options),
        /** 错误态重试：标脏这一格（key 从 options 取，避免闭包里的 shopId 落后） */
        onRetry: () => void queryClient.invalidateQueries({ queryKey: options.queryKey }),
    }
}

export function useSaveShippingTemplate() {
    const queryClient = useQueryClient()
    const shopId = useCurrentShop()?.id

    // 保存后直接回填缓存（响应即权威数据），不走 invalidate
    return useWriteMutation<ShippingTemplateRequest, ShippingTemplateResponse>({
        mutationFn: saveShippingTemplate,
        onSuccess: (saved) => queryClient.setQueryData(shippingKeys.detail(shopId), saved),
        messages: { success: "运费模板已保存" },
    })
}
