import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { notify } from "@shop/app-kit"
import type { MerchantAddressRequest, MerchantAddressResponse } from "@shop/api/sdk"

import { useCurrentShop } from "#/shop"
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
    return useQuery({
        queryKey: addressKeys.lists(shopId),
        queryFn: () => listAddresses(),
        enabled: Boolean(shopId),
    })
}

function useInvalidateAddress() {
    const shop = useCurrentShop()
    const queryClient = useQueryClient()
    const shopId = shop?.id
    return () => queryClient.invalidateQueries({ queryKey: addressKeys.lists(shopId) })
}

export interface AddressMutationResult {
    mutateAsync: (input: MerchantAddressRequest) => Promise<MerchantAddressResponse>
    isPending: boolean
}

/** 新增地址 */
export function useCreateAddress() {
    const invalidate = useInvalidateAddress()
    return useMutation({
        mutationFn: (input: MerchantAddressRequest) => createAddress(input),
        onSuccess: () => {
            void invalidate()
            notify.success("地址已保存")
        },
        onError: (e) => notify.fromError(e),
    })
}

/** 编辑地址（保留原 id） */
export function useUpdateAddress() {
    const invalidate = useInvalidateAddress()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: MerchantAddressRequest }) =>
            updateAddress(id, input),
        onSuccess: () => {
            void invalidate()
            notify.success("地址已更新")
        },
        onError: (e) => notify.fromError(e),
    })
}

/** 删除地址 */
export function useDeleteAddress() {
    const invalidate = useInvalidateAddress()
    return useMutation({
        mutationFn: (id: string) => deleteAddress(id),
        onSuccess: () => {
            void invalidate()
            notify.success("地址已删除")
        },
        onError: (e) => notify.fromError(e),
    })
}

/** 设为默认发货 */
export function useSetDefaultShip() {
    const invalidate = useInvalidateAddress()
    return useMutation({
        mutationFn: (id: string) => setDefaultShip(id),
        onSuccess: () => {
            void invalidate()
            notify.success("已设为默认发货地址")
        },
        onError: (e) => notify.fromError(e),
    })
}

/** 设为默认退货 */
export function useSetDefaultReturn() {
    const invalidate = useInvalidateAddress()
    return useMutation({
        mutationFn: (id: string) => setDefaultReturn(id),
        onSuccess: () => {
            void invalidate()
            notify.success("已设为默认退货地址")
        },
        onError: (e) => notify.fromError(e),
    })
}
