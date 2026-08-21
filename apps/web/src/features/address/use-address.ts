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

/** 删除地址：乐观移除 + 失败回滚 */
export function useDeleteAddress() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteAddress(id),
        onMutate: async (id) => {
            await qc.cancelQueries({ queryKey: KEY })
            const prev = qc.getQueryData<Address[]>(KEY)
            qc.setQueryData<Address[]>(KEY, (old) => old?.filter((a) => a.id !== id) ?? [])
            return { prev }
        },
        onError: (err, _id, ctx) => {
            qc.setQueryData(KEY, ctx?.prev)
            notify.fromError(err, "删除地址失败")
        },
        onSuccess: () => notify.success("地址已删除"),
        onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    })
}

/** 设为默认：乐观置唯一默认 + 失败回滚 */
export function useSetDefaultAddress() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => setDefaultAddress(id),
        onMutate: async (id) => {
            await qc.cancelQueries({ queryKey: KEY })
            const prev = qc.getQueryData<Address[]>(KEY)
            qc.setQueryData<Address[]>(
                KEY,
                (old) => old?.map((a) => ({ ...a, isDefault: a.id === id })) ?? [],
            )
            return { prev }
        },
        onError: (err, _id, ctx) => {
            qc.setQueryData(KEY, ctx?.prev)
            notify.fromError(err, "设置默认失败")
        },
        onSuccess: () => notify.success("已设为默认地址"),
        onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    })
}

/** 取消默认：乐观清默认标记 + 失败回滚 */
export function useUnsetDefaultAddress() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => unsetDefaultAddress(id),
        onMutate: async (id) => {
            await qc.cancelQueries({ queryKey: KEY })
            const prev = qc.getQueryData<Address[]>(KEY)
            qc.setQueryData<Address[]>(
                KEY,
                (old) => old?.map((a) => (a.id === id ? { ...a, isDefault: false } : a)) ?? [],
            )
            return { prev }
        },
        onError: (err, _id, ctx) => {
            qc.setQueryData(KEY, ctx?.prev)
            notify.fromError(err, "取消默认失败")
        },
        onSuccess: () => notify.success("已取消默认地址"),
        onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    })
}

export type { Address }
