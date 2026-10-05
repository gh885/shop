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

/**
 * 类目域 queryKey 工厂 + 取数 + 写操作（SDK 直调）。
 *
 * 失效一律 `categoryKeys.all`：管理端类目树与每个类目的属性模板共享同一前缀
 * （`attrs` 挂在 `all` 下），而任何一次写——建类目、改名、启停、重排、动属性——都会让
 * 至少这两处变旧（禁用会把整支从买家侧剪掉，属性模板决定发布页能选什么）。
 */
export const categoryKeys = {
    all: ["admin", "categories"] as const,
    tree: () => ["admin", "categories", "tree"] as const,
    attrs: (categoryId: string) => ["admin", "categories", "attrs", categoryId] as const,
}

/** 全量类目树（含禁用节点，管理端口径；买家侧那份会把禁用整支剪掉） */
export const adminCategoryTreeOptions = () =>
    queryOptions({
        queryKey: categoryKeys.tree(),
        queryFn: () => CategoriesAdminApi.getAdminCategoryTree(),
    })

/** 某个类目的属性模板（全量属性含禁用 + 值域） */
export const categoryAttrsOptions = (categoryId: string) =>
    queryOptions({
        queryKey: categoryKeys.attrs(categoryId),
        queryFn: () => CategoriesAdminApi.getCategoryAttrTemplate({ path: { id: categoryId } }),
    })

export function useCreateCategory() {
    return useMutation({
        mutationFn: (input: {
            /** 缺省 = 一级类目（后端按 parentId 推导 level，最多三级） */
            parentId?: string
            name: string
            iconUrl?: string
            sort: number
        }) =>
            CategoriesAdminApi.createCategory({
                body: {
                    parentId: input.parentId,
                    name: input.name,
                    sort: input.sort,
                    // 空串 = 没配图标，不落一个空字符串进列里
                    iconUrl: input.iconUrl || undefined,
                },
            }),
        meta: {
            success: message("admin.category.created"),
            error: message("admin.category.failed"),
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
            success: message("admin.category.updated"),
            error: message("admin.category.updateFailed"),
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
            success: message("admin.category.statusUpdated"),
            error: message("admin.category.statusUpdateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

/**
 * 同级重排：一次提交一串 sort 更新，凑成**一个** mutation。
 *
 * 之所以不做成「每个节点一次 useMutation」：那会按行数弹若干次 toast，而运营眼里这是一次操作。
 * `updateCategory` 要求 name 必填、又不支持改 parentId，所以顺序调整只能是「同级换位 + 重算 sort」。
 */
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
            success: message("admin.category.orderUpdated"),
            error: message("admin.category.orderUpdateFailed"),
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
            success: message("admin.category.attr.created"),
            error: message("admin.category.attr.createFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useUpdateCategoryAttr() {
    return useMutation({
        mutationFn: (input: {
            attrId: string
            /** kind 创建后不可改（后端忽略这一格），照原值回传，不编一个假的 */
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
            success: message("admin.category.attr.updated"),
            error: message("admin.category.attr.updateFailed"),
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
            success: message("admin.category.attr.statusUpdated"),
            error: message("admin.category.attr.statusUpdateFailed"),
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
            success: message("admin.category.attrValue.created"),
            error: message("admin.category.attrValue.createFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

/** 改值名会连带刷新引用 SKU 的 attributes 快照（后端同事务做，改名不丢价） */
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
            success: message("admin.category.attrValue.updated"),
            error: message("admin.category.attrValue.updateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}
