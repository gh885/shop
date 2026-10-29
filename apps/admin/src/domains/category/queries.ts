import { message } from "#/locales/message"
import { AdminCategoryControllerApi, type CreateCategoryAttributeRequest } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

// 失效一律 categoryKeys.all：管理端树与每个类目的配置共享前缀，任一写都会让两处变旧
export const categoryKeys = {
    all: ["categories"] as const,
    tree: () => [...categoryKeys.all, "tree"] as const,
    config: (categoryId: string) => [...categoryKeys.all, "config", categoryId] as const,
}

export const adminCategoryTreeOptions = () =>
    queryOptions({
        queryKey: categoryKeys.tree(),
        queryFn: () => AdminCategoryControllerApi.tree(),
    })

/** 类目配置：新契约里 `attributes` 是一串 `AttributeView`（attributeId/code/name/value），没有开关与值域表 */
export const categoryConfigOptions = (categoryId: string) =>
    queryOptions({
        queryKey: categoryKeys.config(categoryId),
        queryFn: () => AdminCategoryControllerApi.config({ path: { categoryId } }),
    })

export function useCreateCategory() {
    return useMutation({
        mutationFn: (input: { parentId?: string; code: string; name: string; sort: number }) =>
            AdminCategoryControllerApi.createCategory({
                body: {
                    parentId: input.parentId,
                    code: input.code,
                    name: input.name,
                    sort: input.sort,
                },
            }),
        meta: {
            success: message("category.created"),
            error: message("category.failed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useRenameCategory() {
    return useMutation({
        mutationFn: (input: { categoryId: string; name: string }) =>
            AdminCategoryControllerApi.rename({
                path: { categoryId: input.categoryId },
                body: { name: input.name },
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
        mutationFn: (input: { categoryId: string; status: "ENABLED" | "DISABLED" }) =>
            AdminCategoryControllerApi.updateCategoryStatus({
                path: { categoryId: input.categoryId },
                body: { status: input.status },
            }),
        meta: {
            success: message("category.statusUpdated"),
            error: message("category.statusUpdateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

/** 同级重排一次提交一串 sort，凑成一个 mutation：拆成每行一次会按行数弹若干 toast，运营眼里是一次操作 */
export function useReorderCategories() {
    return useMutation({
        mutationFn: (updates: { id: string; sort: number }[]) =>
            Promise.all(
                updates.map((row) =>
                    AdminCategoryControllerApi.updateSort({
                        path: { categoryId: row.id },
                        body: { sort: row.sort },
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

/** 叶子配置：识别键 / 匹配策略在类目有商品后被服务端锁死（CATEGORY_CONFIG_LOCKED），品牌策略与免审随时可改 */
export function useUpdateCategoryConfig() {
    return useMutation({
        mutationFn: (input: {
            categoryId: string
            body: {
                identityKeys: string[]
                skuIdentityKinds: string[]
                matchStrategies?: string[]
                brandPolicy: string
                qualificationCodes?: string[]
                autoApprove?: boolean
            }
        }) =>
            AdminCategoryControllerApi.updateConfig({
                path: { categoryId: input.categoryId },
                body: input.body,
            }),
        meta: {
            success: message("category.config.updated"),
            error: message("category.config.updateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

/** 批量新增属性；属性只增不删，下线走 status = disabled */
export function useAddCategoryAttributes() {
    return useMutation({
        mutationFn: (input: { categoryId: string; attributes: CreateCategoryAttributeRequest[] }) =>
            AdminCategoryControllerApi.addAttributes({
                path: { categoryId: input.categoryId },
                body: { attributes: input.attributes },
            }),
        meta: {
            success: message("category.attr.added"),
            error: message("category.attr.addFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

/** 改属性可编辑元数据（name / 开关组 / sort / status）；valueType 等身份键字段契约不收——商品进来后改了存量全对不上 */
export function useUpdateCategoryAttribute() {
    return useMutation({
        mutationFn: (input: {
            categoryId: string
            attributeId: string
            body: {
                name?: string
                required?: boolean
                filterable?: boolean
                multi?: boolean
                allowCustom?: boolean
                sort?: number
                status?: string
            }
        }) =>
            AdminCategoryControllerApi.updateAttribute({
                path: { categoryId: input.categoryId, attributeId: input.attributeId },
                body: input.body,
            }),
        meta: {
            success: message("category.attr.updated"),
            error: message("category.attr.updateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useCreateAttributeValue() {
    return useMutation({
        mutationFn: (input: {
            categoryId: string
            attributeId: string
            body: { value: string; imageUrl?: string; sort?: number }
        }) =>
            AdminCategoryControllerApi.createAttributeValue({
                path: { categoryId: input.categoryId, attributeId: input.attributeId },
                body: input.body,
            }),
        meta: {
            success: message("category.value.added"),
            error: message("category.value.addFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}

export function useUpdateAttributeValue() {
    return useMutation({
        mutationFn: (input: {
            categoryId: string
            attributeId: string
            valueId: string
            body: { imageUrl?: string; sort?: number; status?: string }
        }) =>
            AdminCategoryControllerApi.updateAttributeValue({
                path: {
                    categoryId: input.categoryId,
                    attributeId: input.attributeId,
                    valueId: input.valueId,
                },
                body: input.body,
            }),
        meta: {
            success: message("category.value.updated"),
            error: message("category.value.updateFailed"),
            invalidates: [categoryKeys.all],
        },
    })
}
