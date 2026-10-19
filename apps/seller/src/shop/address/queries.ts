import { message } from "#/locales/message"
import { queryOptions, useMutation } from "@tanstack/react-query"
import { regionNamesByCode } from "@shop/common/domain"
import { SellerAddressesApi, type MerchantAddressRequest } from "@shop/api/sdk"

import type { AddressFormValues } from "./address-form"

const addressKeys = {
    all: ["addresses"] as const,
    lists: (shopId: string) => [...addressKeys.all, shopId, "list"] as const,
}

export const addressListOptions = (shopId: string) =>
    queryOptions({
        queryKey: addressKeys.lists(shopId),
        queryFn: () => SellerAddressesApi.listAddresses1(),
    })

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

export function useCreateAddress(shopId: string) {
    return useMutation({
        mutationFn: async (input: AddressFormValues) =>
            SellerAddressesApi.createAddress1({ body: await toMerchantAddressRequest(input) }),
        meta: {
            success: message("shop.address.saved"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}

export function useUpdateAddress(shopId: string) {
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: AddressFormValues }) =>
            SellerAddressesApi.updateAddress1({
                path: { id },
                body: await toMerchantAddressRequest(input),
            }),
        meta: {
            success: message("shop.address.updated"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}

export function useDeleteAddress(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.deleteAddress1({ path: { id } }),
        meta: {
            success: message("shop.address.deleted"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}

export function useSetDefaultShip(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.setDefaultShip({ path: { id } }),
        meta: {
            success: message("shop.address.setDefaultSend"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}

export function useSetDefaultReturn(shopId: string) {
    return useMutation({
        mutationFn: (id: string) => SellerAddressesApi.setDefaultReturn({ path: { id } }),
        meta: {
            success: message("shop.address.setDefaultReturn"),
            invalidates: [addressKeys.lists(shopId)],
        },
    })
}
