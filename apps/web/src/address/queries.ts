import { queryOptions } from "@tanstack/react-query"
import { AddressesApi } from "@shop/api/sdk"

import { useOptimisticListMutation, useWriteMutation } from "@shop/app-kit"

import { toAddress, type Address, type AddressInput, type AddressParse } from "./address"

/** address/queries —— 地址的 React 接线层。规则/类型在 ./address.ts，这里只管读写。

 * 地址列表只在「收货地址」页读、无跨路由共享；留在 query 是为乐观更新（删除/默认态）。
 * 列表 options 导出供 route loader 客户端预热。 */

const KEY = ["addresses"] as const

async function listAddresses(): Promise<Address[]> {
    const res = await AddressesApi.listAddresses()
    return res.map(toAddress)
}

/** 我的地址列表 queryOptions：组件经 loader 读完直接读缓存，失败由路由错误页接管 */
export const addressListOptions = queryOptions({ queryKey: KEY, queryFn: listAddresses })

/** 新增地址：成功后失效列表缓存 */
export function useCreateAddress() {
    return useWriteMutation<AddressInput>({
        mutationFn: (input) =>
            AddressesApi.createAddress({ body: { ...input, receiverName: input.receiver } }),
        invalidateKeys: [KEY],
        messages: { success: "地址已添加", error: "添加地址失败" },
    })
}

/** 修改地址 */
export function useUpdateAddress() {
    return useWriteMutation<{ id: string; input: AddressInput }>({
        mutationFn: ({ id, input }) =>
            AddressesApi.updateAddress({
                path: { id },
                body: { ...input, receiverName: input.receiver },
            }),
        invalidateKeys: [KEY],
        messages: { success: "地址已更新", error: "更新地址失败" },
    })
}

/** 删除地址：乐观移除 + 失败回滚 */
export function useDeleteAddress() {
    return useOptimisticListMutation<Address, string>({
        queryKey: KEY,
        mutationFn: (id) => AddressesApi.deleteAddress({ path: { id } }),
        patch: (list, id) => list.filter((a) => a.id !== id),
        messages: { success: "地址已删除", error: "删除地址失败" },
    })
}

/** 设为默认：乐观置唯一默认 + 失败回滚 */
export function useSetDefaultAddress() {
    return useOptimisticListMutation<Address, string>({
        queryKey: KEY,
        mutationFn: (id) => AddressesApi.setDefaultAddress({ path: { id } }),
        patch: (list, id) => list.map((a) => ({ ...a, isDefault: a.id === id })),
        messages: { success: "已设为默认地址", error: "设置默认失败" },
    })
}

/** 取消默认：乐观清默认标记 + 失败回滚 */
export function useUnsetDefaultAddress() {
    return useOptimisticListMutation<Address, string>({
        queryKey: KEY,
        mutationFn: (id) => AddressesApi.unsetDefaultAddress({ path: { id } }),
        patch: (list, id) => list.map((a) => (a.id === id ? { ...a, isDefault: false } : a)),
        messages: { success: "已取消默认地址", error: "取消默认失败" },
    })
}

/** 智能粘贴：解析文本 → 业务形状（表单「粘贴并识别」用）。
 *  wire 的 receiverName → receiver 归一，与 toAddress 同一投影规则 —— 不归一则表单永远收不到收货人。 */
export async function parseAddressText(text: string): Promise<AddressParse> {
    const res = await AddressesApi.parseAddress({ body: { text } })
    return {
        receiver: res.receiverName,
        phone: res.phone,
        regionCode: res.regionCode,
        province: res.province,
        city: res.city,
        district: res.district,
        detail: res.detail,
    }
}
