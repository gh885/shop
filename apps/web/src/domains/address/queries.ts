import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { regionNamesByCode } from "@shop/common/domain"
import { AddressesApi, type AddressRequest } from "@shop/api/sdk"

import { optimisticListMutationOptions } from "@shop/app-kit/data"
import { type Address, type AddressInput, type AddressParse } from "./rules"
import { toAddress } from "./mapper"

const KEY = ["addresses"] as const

async function listAddresses(): Promise<Address[]> {
    const res = await AddressesApi.listAddresses()
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
            AddressesApi.createAddress({ body: await toAddressRequest(input) }),
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
            AddressesApi.updateAddress({
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
            mutationFn: (id) => AddressesApi.deleteAddress({ path: { id } }),
            patch: (list, id) => list.filter((a) => a.id !== id),
            meta: {
                success: message("address.toast.deleted"),
                error: message("address.toast.deleteFailed"),
            },
        }),
    )
}

export function useSetDefaultAddress() {
    return useMutation(
        optimisticListMutationOptions<Address, string>({
            queryKey: KEY,
            mutationFn: (id) => AddressesApi.setDefaultAddress({ path: { id } }),
            patch: (list, id) => list.map((a) => ({ ...a, isDefault: a.id === id })),
            meta: {
                success: message("address.toast.setDefault"),
                error: message("address.toast.setDefaultFailed"),
            },
        }),
    )
}

export function useUnsetDefaultAddress() {
    return useMutation(
        optimisticListMutationOptions<Address, string>({
            queryKey: KEY,
            mutationFn: (id) => AddressesApi.unsetDefaultAddress({ path: { id } }),
            patch: (list, id) => list.map((a) => (a.id === id ? { ...a, isDefault: false } : a)),
            meta: {
                success: message("address.toast.unsetDefault"),
                error: message("address.toast.unsetDefaultFailed"),
            },
        }),
    )
}

export async function parseAddressText(text: string): Promise<AddressParse> {
    const res = await AddressesApi.parseAddress({ body: { text } })
    return {
        receiver: res.receiverName,
        phone: res.phone,
        regionCode: res.regionCode,
        detail: res.detail,
    }
}
