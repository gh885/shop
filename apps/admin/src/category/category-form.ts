import { zCreateCategoryRequest } from "@shop/api"
import { z } from "zod"
import { messageFactFactory } from "@shop/common/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

const err = messageFactFactory<
    Extract<AdminMessageKey, `category.form.err.${string}`>,
    AdminParamsByKey
>()

/**
 * 类目表单的校验取契约的同一格（`maxLength` 也从它读），只补一条「非空」：
 * 契约那格是 `min(0)`，空的能过 zod 但会被后端 `@NotBlank` 挡回 422，前端先拦下更省一个来回。
 *
 * 编辑与新建两个表单共用这一份：两处各写一遍的话，「名字能不能留空」就有了两套口径。
 */
export const categoryFormSchema = z.object({
    name: zCreateCategoryRequest.shape.name.refine(
        (value) => value.trim().length > 0,
        err("category.form.err.categoryNameRequired"),
    ),
    // 契约里 iconUrl 是可选的；表单里它必须有值（空串 = 不配图标），所以拆掉 optional 只留形状与上限
    iconUrl: zCreateCategoryRequest.shape.iconUrl.unwrap(),
})

export type CategoryFormValues = z.infer<typeof categoryFormSchema>

/** 输入框的字符上限：跟着契约那一格走，不抄第二个数（写死就会「前端放行、后端 422」） */
export const CATEGORY_NAME_MAX = zCreateCategoryRequest.shape.name.maxLength ?? undefined
export const CATEGORY_ICON_MAX =
    zCreateCategoryRequest.shape.iconUrl.unwrap().maxLength ?? undefined
