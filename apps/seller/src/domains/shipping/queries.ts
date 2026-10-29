import { message } from "#/locales/message"
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { SellerShippingTemplateControllerApi, type ShippingTemplateRequest } from "@shop/api/sdk"

const shippingKeys = {
    all: ["shipping-template"] as const,
    list: (shopId: string) => [...shippingKeys.all, shopId] as const,
}

/**
 * 本店的运费模板列表。后端按店可有多条（draft / active / archived 各一条），
 * 启用时自动归档同店旧模板——所以列表里 active 最多一条。
 */
export const shippingTemplateOptions = (shopId: string) =>
    queryOptions({
        queryKey: shippingKeys.list(shopId),
        queryFn: ({ signal }) =>
            SellerShippingTemplateControllerApi.listTemplates({ query: { shopId }, signal }),
        // 权限/网络类失败直接抛给路由错误页，不做静默兜底
        retry: false,
    })

export function useSaveShippingTemplate(shopId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: ShippingTemplateRequest) =>
            SellerShippingTemplateControllerApi.createTemplate({ body: input }),
        meta: { success: message("shipping.toast.saved") },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: shippingKeys.list(shopId) }),
    })
}

export function useActivateShippingTemplate(shopId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) =>
            SellerShippingTemplateControllerApi.activateTemplate({ path: { id } }),
        meta: { success: message("shipping.toast.activated") },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: shippingKeys.list(shopId) }),
    })
}
