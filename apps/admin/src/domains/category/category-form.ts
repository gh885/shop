import { zCreateCategoryRequest } from "@shop/api"
import { z } from "zod"
import { messageFactFactory } from "@shop/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

const err = messageFactFactory<
    Extract<AdminMessageKey, `category.form.err.${string}`>,
    AdminParamsByKey
>()

export const categoryFormSchema = z.object({
    name: zCreateCategoryRequest.shape.name.refine(
        (value) => value.trim().length > 0,
        err("category.form.err.categoryNameRequired"),
    ),
    // iconUrl 契约可选、表单必填一格：空串 = 不配图标，故 unwrap 只留形状与上限
    iconUrl: zCreateCategoryRequest.shape.iconUrl.unwrap(),
})

export type CategoryFormValues = z.infer<typeof categoryFormSchema>

// 上限跟着契约那一格走，别抄第二个数（写死就会「前端放行、后端 422」）
export const CATEGORY_NAME_MAX = zCreateCategoryRequest.shape.name.maxLength ?? undefined
export const CATEGORY_ICON_MAX =
    zCreateCategoryRequest.shape.iconUrl.unwrap().maxLength ?? undefined
