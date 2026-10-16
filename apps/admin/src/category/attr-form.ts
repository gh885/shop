import type { CategoryAttrResponse } from "@shop/api/sdk"
import { zCategoryAttrRequest, zCategoryAttrValueRequest } from "@shop/api"
import { z } from "zod"
import { messageFactFactory } from "@shop/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

const err = messageFactFactory<
    Extract<AdminMessageKey, `category.form.err.${string}`>,
    AdminParamsByKey
>()

export const attrFormSchema = z.object({
    name: zCategoryAttrRequest.shape.name.refine(
        (value) => value.trim().length > 0,
        err("category.form.err.attrNameRequired"),
    ),
    kind: zCategoryAttrRequest.shape.kind,
    required: z.boolean(),
    allowCustom: z.boolean(),
    allowImage: z.boolean(),
})

export type AttrFormValues = z.infer<typeof attrFormSchema>

export const valueFormSchema = z.object({
    value: zCategoryAttrValueRequest.shape.value.refine(
        (value) => value.trim().length > 0,
        err("category.form.err.attrValueRequired"),
    ),
    // image 契约可选、表单必填一格：空串 = 不配图，故 unwrap 只留形状与上限
    image: zCategoryAttrValueRequest.shape.image.unwrap(),
})

// 上限从契约那一格读，别抄第二个数（抄来的那份在契约放宽时不会跟着走）
export const ATTR_NAME_MAX = zCategoryAttrRequest.shape.name.maxLength ?? undefined
export const ATTR_VALUE_MAX = zCategoryAttrValueRequest.shape.value.maxLength ?? undefined

type AttrRuleKey = Extract<AdminMessageKey, `category.rules.${string}`>

export function describeAttrRules(
    attr: CategoryAttrResponse,
    t: (key: AttrRuleKey) => string,
): string {
    const rules = [
        attr.required ? t("category.rules.required") : undefined,
        attr.allowCustom ? t("category.rules.allowCustom") : undefined,
        attr.allowImage ? t("category.rules.allowImage") : undefined,
    ].filter(Boolean)
    return rules.length > 0 ? rules.join(" · ") : t("category.rules.none")
}
