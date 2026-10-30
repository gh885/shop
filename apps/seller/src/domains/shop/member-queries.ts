import { SellerOperatorControllerApi } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { message } from "#/locales/message"

const KEY = ["shop-member"] as const

export const memberKeys = {
    all: KEY,
    operators: () => [...KEY, "operators"] as const,
    roles: () => [...KEY, "roles"] as const,
    shops: () => [...KEY, "shops"] as const,
}

export const operatorsOptions = () =>
    queryOptions({
        queryKey: memberKeys.operators(),
        queryFn: ({ signal }) => SellerOperatorControllerApi.listOperators({ signal }),
    })

export const rolesOptions = () =>
    queryOptions({
        queryKey: memberKeys.roles(),
        queryFn: ({ signal }) => SellerOperatorControllerApi.listRoles({ signal }),
    })

export const shopsOptions = () =>
    queryOptions({
        queryKey: memberKeys.shops(),
        queryFn: ({ signal }) => SellerOperatorControllerApi.listShops({ signal }),
    })

export type CreateOperatorInput = {
    loginName: string
    password: string
    displayName: string
    roleIds: string[]
    shopIds: string[]
}

export function useCreateOperator() {
    return useMutation({
        mutationFn: (input: CreateOperatorInput) =>
            SellerOperatorControllerApi.createOperator({ body: input }),
        meta: {
            success: message("shop.member.created"),
            error: message("shop.member.createFailed"),
            invalidates: [memberKeys.all],
        },
    })
}

export function useUpdateOperator() {
    return useMutation({
        mutationFn: (input: {
            operatorId: string
            displayName?: string
            roleIds?: string[]
            shopIds?: string[]
        }) =>
            SellerOperatorControllerApi.updateOperator({
                path: { operatorId: input.operatorId },
                body: {
                    displayName: input.displayName,
                    roleIds: input.roleIds,
                    shopIds: input.shopIds,
                },
            }),
        meta: {
            success: message("shop.member.updated"),
            error: message("shop.member.updateFailed"),
            invalidates: [memberKeys.all],
        },
    })
}

export function useUpdateOperatorStatus() {
    return useMutation({
        mutationFn: (input: { operatorId: string; status: "active" | "disabled" }) =>
            SellerOperatorControllerApi.updateStatus2({
                path: { operatorId: input.operatorId },
                body: { status: input.status },
            }),
        meta: {
            success: message("shop.member.statusUpdated"),
            error: message("shop.member.statusUpdateFailed"),
            invalidates: [memberKeys.all],
        },
    })
}

export function useResetOperatorPassword() {
    return useMutation({
        mutationFn: (input: { operatorId: string; password: string }) =>
            SellerOperatorControllerApi.resetPassword({
                path: { operatorId: input.operatorId },
                body: { password: input.password },
            }),
        meta: {
            success: message("shop.member.passwordReset"),
            error: message("shop.member.passwordResetFailed"),
            invalidates: [],
        },
    })
}

export function useCreateRole() {
    return useMutation({
        mutationFn: (input: { code: string; name: string; permissionCodes: string[] }) =>
            SellerOperatorControllerApi.createRole({ body: input }),
        meta: {
            success: message("shop.role.created"),
            error: message("shop.role.createFailed"),
            invalidates: [memberKeys.all],
        },
    })
}

export function useDeleteRole() {
    return useMutation({
        mutationFn: (roleId: string) =>
            SellerOperatorControllerApi.deleteRole({ path: { roleId } }),
        meta: {
            success: message("shop.role.deleted"),
            error: message("shop.role.deleteFailed"),
            invalidates: [memberKeys.all],
        },
    })
}
