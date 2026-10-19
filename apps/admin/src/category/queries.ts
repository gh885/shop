import { message } from "#/locales/message"
import { CategoriesAdminApi } from "@shop/api/sdk"
import type {
    AttrKind,
    CategoryAttrStatus,
    CategoryAttrValueRequest,
    CategoryStatus,
} from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

import type { CategorySortUpdate } from "./tree"

// 失效一律 categoryKeys.all：管理端树与每个类目的属性模板共享前缀，任一写都会让两处变旧
export const categoryKeys = {
    all: ["categories"] as const,
    tree: () => ["categories", "tree"] as const,
    attrs: (categoryId: string) => ["categories", "attrs", categoryId] as const,
}

export const adminCategoryTreeOptions = () =>
    queryOptions({
        queryKey: categoryKeys.tree(),
        queryFn: () => CategoriesAdminApi.getAdminCategoryTree(),
    })

export const categoryAttrsOptions = (categoryId: string) =>
    queryOptions({
        queryKey: categoryKeys.attrs(categoryId),
        queryFn: () => CategoriesAdminApi.getCategoryAttrTemplate({ path: { id: categoryId } }),
    })

export function useCreateCategory() {
    return useMutation({
        mutationFn: (input: { parentId?: string; name: string; iconUrl?: string; sort: number }) =>
            CategoriesAdminApi.createCategory({
                body: {
                    parentId: input.parentId,
                    name: input.name,
                    sort: input.sort,
                    // 空串 = 没配图标，折成 undefined，不落空字符串进列
                    iconUrl: input.iconUrl || undefined,
                },
            }),
        meta: {
            success: message("category.created"),
            error: message("category.failed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useUpdateCategory() {
    return useMutation({
        mutationFn: (input: { id: string; name: string; iconUrl: string }) =>
            CategoriesAdminApi.updateCategory({
                path: { id: input.id },
                body: { name: input.name, iconUrl: input.iconUrl || undefined },
            }),
        meta: {
            success: message("category.updated"),
            error: message("category.updateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useSetCategoryStatus() {
    return useMutation({
        mutationFn: (input: { id: string; status: CategoryStatus }) =>
            CategoriesAdminApi.updateCategoryStatus({
                path: { id: input.id },
                body: { status: input.status },
            }),
        meta: {
            success: message("category.statusUpdated"),
            error: message("category.statusUpdateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

// 同级重排一次提交一串 sort，凑成一个 mutation：拆成每行一次会按行数弹若干 toast，运营眼里是一次操作
export function useReorderCategories() {
    return useMutation({
        mutationFn: (updates: CategorySortUpdate[]) =>
            Promise.all(
                updates.map((row) =>
                    CategoriesAdminApi.updateCategory({
                        path: { id: row.id },
                        body: { name: row.name, sort: row.sort, iconUrl: row.iconUrl || undefined },
                    }),
                ),
            ),
        meta: {
            success: message("category.orderUpdated"),
            error: message("category.orderUpdateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useCreateCategoryAttr() {
    return useMutation({
        mutationFn: (input: {
            categoryId: string
            name: string
            kind: AttrKind
            required: boolean
            allowCustom: boolean
            allowImage: boolean
        }) =>
            CategoriesAdminApi.createCategoryAttr({
                path: { id: input.categoryId },
                body: {
                    name: input.name,
                    kind: input.kind,
                    required: input.required,
                    allowCustom: input.allowCustom,
                    allowImage: input.allowImage,
                },
            }),
        meta: {
            success: message("category.attr.created"),
            error: message("category.attr.createFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useUpdateCategoryAttr() {
    return useMutation({
        mutationFn: (input: {
            attrId: string
            kind: AttrKind
            name: string
            required: boolean
            allowCustom: boolean
            allowImage: boolean
        }) =>
            CategoriesAdminApi.updateCategoryAttr({
                path: { attrId: input.attrId },
                body: {
                    name: input.name,
                    kind: input.kind,
                    required: input.required,
                    allowCustom: input.allowCustom,
                    allowImage: input.allowImage,
                },
            }),
        meta: {
            success: message("category.attr.updated"),
            error: message("category.attr.updateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useSetCategoryAttrStatus() {
    return useMutation({
        mutationFn: (input: { attrId: string; status: CategoryAttrStatus }) =>
            CategoriesAdminApi.updateCategoryAttrStatus({
                path: { attrId: input.attrId },
                body: { status: input.status },
            }),
        meta: {
            success: message("category.attr.statusUpdated"),
            error: message("category.attr.statusUpdateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useCreateCategoryAttrValue() {
    return useMutation({
        mutationFn: (input: { attrId: string; value: string; image?: string }) =>
            CategoriesAdminApi.createCategoryAttrValue({
                path: { attrId: input.attrId },
                body: { value: input.value, image: input.image || undefined },
            }),
        meta: {
            success: message("category.attrValue.created"),
            error: message("category.attrValue.createFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useUpdateCategoryAttrValue() {
    return useMutation({
        mutationFn: (input: { valueId: string; value: string; image?: string }) => {
            const body: CategoryAttrValueRequest = {
                value: input.value,
                image: input.image || undefined,
            }
            return CategoriesAdminApi.updateCategoryAttrValue({
                path: { valueId: input.valueId },
                body,
            })
        },
        meta: {
            success: message("category.attrValue.updated"),
            error: message("category.attrValue.updateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}
