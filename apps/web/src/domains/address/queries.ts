import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { regionNamesByCode } from "@shop/common/domain"
import { AddressControllerApi, type AddressRequest } from "@shop/api/sdk"

import { optimisticListMutationOptions } from "@shop/app-kit/data"
import { type Address, type AddressInput, type AddressParse } from "./rules"
import { toAddress } from "./mapper"

const KEY = ["addresses"] as const

async function listAddresses(): Promise<Address[]> {
    const res = await AddressControllerApi.listAddresses()
    return res.map(toAddress)
}

export const addressListOptions = queryOptions({ queryKey: KEY, queryFn: listAddresses })

async function toAddressRequest(values: AddressInput): Promise<AddressRequest> {
    return {
        ...(await regionNamesByCode(values.regionCode)),
        receiverName: values.receiver,
        phone: values.phone,
        regionCode: values.regionCode,
        detail: values.detail,
        label: values.label,
        isDefault: values.isDefault,
    }
}

export function useCreateAddress() {
    return useMutation({
        mutationFn: async (input: AddressInput) =>
            AddressControllerApi.createAddress({ body: await toAddressRequest(input) }),
        meta: {
            success: message("address.toast.created"),
            error: message("address.toast.createFailed"),
            invalidates: [KEY],
        },
    })
}

export function useUpdateAddress() {
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: AddressInput }) =>
            AddressControllerApi.updateAddress({
                path: { id },
                body: await toAddressRequest(input),
            }),
        meta: {
            success: message("address.toast.updated"),
            error: message("address.toast.updateFailed"),
            invalidates: [KEY],
        },
    })
}

export function useDeleteAddress() {
    return useMutation(
        optimisticListMutationOptions<Address, string>({
            queryKey: KEY,
            mutationFn: (id) => AddressControllerApi.deleteAddress({ path: { id } }),
            patch: (list, id) => list.filter((a) => a.id !== id),
            meta: {
                success: message("address.toast.deleted"),
                error: message("address.toast.deleteFailed"),
            },
        }),
    )
}

/** 默认地址是同一入口的开关：PATCH `{ isDefault }`，开和关走同一个 mutation */
function useSetDefault(isDefault: boolean) {
    return useMutation(
        optimisticListMutationOptions<Address, string>({
            queryKey: KEY,
            mutationFn: (id) =>
                AddressControllerApi.patchAddress({ path: { id }, body: { isDefault } }),
            patch: (list, id) =>
                list.map((a) => ({
                    ...a,
                    isDefault: isDefault ? a.id === id : a.isDefault && a.id !== id,
                })),
            meta: {
                success: message(
                    isDefault ? "address.toast.setDefault" : "address.toast.unsetDefault",
                ),
                error: message(
                    isDefault
                        ? "address.toast.setDefaultFailed"
                        : "address.toast.unsetDefaultFailed",
                ),
            },
        }),
    )
}

export function useSetDefaultAddress() {
    return useSetDefault(true)
}

export function useUnsetDefaultAddress() {
    return useSetDefault(false)
}

export async function parseAddressText(text: string): Promise<AddressParse> {
    const res = await AddressControllerApi.parseAddress({ body: { text } })
    return {
        receiver: res.receiverName,
        phone: res.phone,
        regionCode: res.regionCode,
        detail: res.detail,
    }
}
