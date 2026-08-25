import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
    createAddress,
    deleteAddress,
    listAddresses,
    setDefaultAddress,
    unsetDefaultAddress,
    updateAddress,
    type Address,
    type AddressInput,
} from "#/entities/address"
import { notify } from "#/shared/lib/toast"
import { useOptimisticListMutation } from "#/shared/lib/use-optimistic-list"

const KEY = ["addresses"] as const

/** 我的地址列表 */
export function useAddressList() {
    return useQuery({ queryKey: KEY, queryFn: listAddresses })
}

/** 新增地址：成功后失效列表缓存 */
export function useCreateAddress() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: AddressInput) => createAddress(input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY })
            notify.success("地址已添加")
        },
        onError: (err) => notify.fromError(err, "添加地址失败"),
    })
}

/** 修改地址 */
export function useUpdateAddress() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: AddressInput }) =>
            updateAddress(id, input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY })
            notify.success("地址已更新")
        },
        onError: (err) => notify.fromError(err, "更新地址失败"),
    })
}

/** 删除地址：乐观移除 + 失败回滚 */
export function useDeleteAddress() {
    return useOptimisticListMutation<Address, string>({
        queryKey: KEY,
        mutationFn: (id) => deleteAddress(id),
        patch: (list, id) => list.filter((a) => a.id !== id),
        messages: { success: "地址已删除", error: "删除地址失败" },
    })
}

/** 设为默认：乐观置唯一默认 + 失败回滚 */
export function useSetDefaultAddress() {
    return useOptimisticListMutation<Address, string>({
        queryKey: KEY,
        mutationFn: (id) => setDefaultAddress(id),
        patch: (list, id) => list.map((a) => ({ ...a, isDefault: a.id === id })),
        messages: { success: "已设为默认地址", error: "设置默认失败" },
    })
}

/** 取消默认：乐观清默认标记 + 失败回滚 */
export function useUnsetDefaultAddress() {
    return useOptimisticListMutation<Address, string>({
        queryKey: KEY,
        mutationFn: (id) => unsetDefaultAddress(id),
        patch: (list, id) => list.map((a) => (a.id === id ? { ...a, isDefault: false } : a)),
        messages: { success: "已取消默认地址", error: "取消默认失败" },
    })
}

export type { Address } from "#/entities/address"
