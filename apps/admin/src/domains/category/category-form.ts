import { CreateCategoryRequestSchema } from "@shop/api/schemas"
import { z } from "zod"
import { messageFactFactory } from "@shop/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

const err = messageFactFactory<
    Extract<AdminMessageKey, `category.form.err.${string}`>,
    AdminParamsByKey
>()

const CODE_MAX = CreateCategoryRequestSchema.properties.code.maxLength
const NAME_MAX = CreateCategoryRequestSchema.properties.name.maxLength

/**
 * 类目表单：新契约 `CreateCategoryRequest` 是 `{ parentId?, code, name, sort?, config? }`。
 * 旧的 `iconUrl` 已随重导出消失（后端 `catalog.category` 没有这一列）。
 */
export const categoryFormSchema = z.object({
    code: z.string().trim().min(1, err("category.form.err.categoryCodeRequired")).max(CODE_MAX),
    name: z.string().trim().min(1, err("category.form.err.categoryNameRequired")).max(NAME_MAX),
})

export type CategoryFormValues = z.infer<typeof categoryFormSchema>

export const CATEGORY_CODE_MAX = CODE_MAX
export const CATEGORY_NAME_MAX = NAME_MAX
