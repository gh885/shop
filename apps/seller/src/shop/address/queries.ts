import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { MerchantAddressRequest } from "@shop/api/sdk"

import { useCurrentShop } from "#/shop"
import { useWriteMutation } from "@shop/app-kit"

import {
    createAddress,
    deleteAddress,
    listAddresses,
    setDefaultReturn,
    setDefaultShip,
    updateAddress,
} from "./data"

// ---------- address 域 queryKey 工厂（前缀结构一眼可见，invalidate 不漏 key） ----------

export const addressKeys = {
    all: ["addresses"] as const,
    lists: (shopId: string | undefined) => ["addresses", shopId, "list"] as const,
}

/** 本店地址库列表 */
export function useAddressList() {
    const shop = useCurrentShop()
    const shopId = shop?.id
    const queryClient = useQueryClient()
    return {
        ...useQuery({
            queryKey: addressKeys.lists(shopId),
            queryFn: () => listAddresses(),
            enabled: Boolean(shopId),
        }),
        /** 错误态重试：与五个写操作同一条失效入口 */
        onRetry: () => void queryClient.invalidateQueries({ queryKey: addressKeys.lists(shopId) }),
    }
}

/**
 * 本店地址的五个写操作只差 mutationFn 与成功文案：
 * 失效 key（含当前店铺）、toast 文案、错误归一全部走 useWriteMutation，不再逐个手写。
 */
function useAddressMutation<TInput>(
    mutationFn: (input: TInput) => Promise<unknown>,
    success: string,
) {
    const shopId = useCurrentShop()?.id
    const queryClient = useQueryClient()
    return useWriteMutation<TInput>({
        mutationFn,
        invalidate: () =>
            void queryClient.invalidateQueries({ queryKey: addressKeys.lists(shopId) }),
        messages: { success },
    })
}

/** 新增地址 */
export function useCreateAddress() {
    return useAddressMutation(createAddress, "地址已保存")
}

/** 编辑地址（保留原 id） */
export function useUpdateAddress() {
    return useAddressMutation(
        ({ id, input }: { id: string; input: MerchantAddressRequest }) => updateAddress(id, input),
        "地址已更新",
    )
}

/** 删除地址 */
export function useDeleteAddress() {
    return useAddressMutation((id: string) => deleteAddress(id), "地址已删除")
}

/** 设为默认发货 */
export function useSetDefaultShip() {
    return useAddressMutation((id: string) => setDefaultShip(id), "已设为默认发货地址")
}

/** 设为默认退货 */
export function useSetDefaultReturn() {
    return useAddressMutation((id: string) => setDefaultReturn(id), "已设为默认退货地址")
}
