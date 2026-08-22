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

/**
 * 乐观更新 mutation 工厂（删除/设默认/取消默认共用脚手架）：
 * onMutate 先本地改缓存、失败回滚 prev、成功提示、settled 失效重取。
 * patch 描述「给定旧列表与目标 id，返回新列表」。
 */
function useOptimisticAddressMutation(
    mutationFn: (id: string) => Promise<unknown>,
    patch: (list: Address[], id: string) => Address[],
    messages: { success: string; error: string },
) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn,
        onMutate: async (id) => {
            await qc.cancelQueries({ queryKey: KEY })
            const prev = qc.getQueryData<Address[]>(KEY)
            qc.setQueryData<Address[]>(KEY, (old) => patch(old ?? [], id))
            return { prev }
        },
        onError: (err, _id, ctx) => {
            qc.setQueryData(KEY, ctx?.prev)
            notify.fromError(err, messages.error)
        },
        onSuccess: () => notify.success(messages.success),
        onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    })
}

/** 删除地址：乐观移除 + 失败回滚 */
export function useDeleteAddress() {
    return useOptimisticAddressMutation(
        deleteAddress,
        (list, id) => list.filter((a) => a.id !== id),
        { success: "地址已删除", error: "删除地址失败" },
    )
}

/** 设为默认：乐观置唯一默认 + 失败回滚 */
export function useSetDefaultAddress() {
    return useOptimisticAddressMutation(
        setDefaultAddress,
        (list, id) => list.map((a) => ({ ...a, isDefault: a.id === id })),
        { success: "已设为默认地址", error: "设置默认失败" },
    )
}

/** 取消默认：乐观清默认标记 + 失败回滚 */
export function useUnsetDefaultAddress() {
    return useOptimisticAddressMutation(
        unsetDefaultAddress,
        (list, id) => list.map((a) => (a.id === id ? { ...a, isDefault: false } : a)),
        { success: "已取消默认地址", error: "取消默认失败" },
    )
}

export type { Address }
