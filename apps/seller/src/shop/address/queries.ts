import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { regionNamesByCode } from "@shop/common/domain"
import { SellerAddressesApi, type MerchantAddressRequest } from "@shop/api/sdk"

import type { AddressFormValues } from "./address-form"

// address 域 queryKey 工厂（前缀结构一眼可见，invalidate 不漏 key）
const addressKeys = {
    all: ["addresses"] as const,
    lists: (shopId: string) => ["addresses", shopId, "list"] as const,
}

/** 本店地址库列表：shopId 由路由守卫（ShopGate）保证必有，页面经 useShop() 取到后传入。
 *  suspense 形态：页面用 useSuspenseQuery 消费——加载中由路由 pendingComponent 兜住，
 *  失败抛给路由错误页（官方边界 + 重置重试），页面不再手写 isLoading 骨架与错误态。 */
export const addressListOptions = (shopId: string) =>
    queryOptions({
        queryKey: addressKeys.lists(shopId),
        queryFn: () => SellerAddressesApi.listAddresses1(),
    })

/**
 * 本店地址的五个写操作：各自声明成功文案与失效范围（当前店的列表）。
 * 错误归一与提示由全局 MutationCache 负责，这里不写 onError。
 */

/** 表单值 → wire：省市区名按 regionCode 现查（用的就是级联选择器那条路径，看到的=落库的） */
async function toMerchantAddressRequest(
    values: AddressFormValues,
): Promise<MerchantAddressRequest> {
    const { regionCode, ...rest } = values
    return {
        ...(await regionNamesByCode(regionCode)),
        regionCode,
        ...rest,
    }
}

/** 新增地址（可同时标记默认发货/默认退货） */
export function useCreateAddress(shopId: string) {
    return useMutation({
        mutationFn: async (input: AddressFormValues) =>
            SellerAddressesApi.createAddress1({ body: await toMerchantAddressRequest(input) }),
        meta: {
            success: message("seller.shop.address.saved"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}

/** 编辑地址（保留原 id） */
export function useUpdateAddress(shopId: string) {
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: AddressFormValues }) =>
            SellerAddressesApi.updateAddress1({
                path: { id },
                body: await toMerchantAddressRequest(input),
            }),
        meta: {
            success: message("seller.shop.address.updated"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}

/** 删除地址（软删） */
export function useDeleteAddress(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.deleteAddress1({ path: { id } }),
        meta: {
            success: message("seller.shop.address.deleted"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}

/** 设为默认发货 */
export function useSetDefaultShip(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.setDefaultShip({ path: { id } }),
        meta: {
            success: message("seller.shop.address.setDefaultSend"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}

/** 设为默认退货 */
export function useSetDefaultReturn(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.setDefaultReturn({ path: { id } }),
        meta: {
            success: message("seller.shop.address.setDefaultReturn"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}
