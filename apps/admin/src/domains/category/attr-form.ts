import type { CategoryAttributeView } from "@shop/api/sdk"
import { zCreateAttributeValueRequest, zCreateCategoryAttributeRequest } from "@shop/api"
import { messageFactFactory } from "@shop/i18n"
import { z } from "zod"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

const err = messageFactFactory<
    Extract<AdminMessageKey, `category.form.err.${string}`>,
    AdminParamsByKey
>()

/** 值类型词表：镜像后端 `ValueType`（enum/number 能当识别属性；text/bool 不能） */
export const VALUE_TYPES = ["text", "number", "enum", "bool"] as const

/** 属性状态：后端落小写，只收 active / disabled */
export const ATTR_STATUSES = ["active", "disabled"] as const

const nameField = zCreateCategoryAttributeRequest.shape.name
const codeField = zCreateCategoryAttributeRequest.shape.code

/** 新增属性：形状镜像 `CreateCategoryAttributeRequest`；条件校验（enum 必配值域、number 必配单位、identity 只许 enum/number）在这里拦，服务端兜底 */
export const addAttributeFormSchema = z
    .object({
        code: codeField,
        name: nameField,
        valueType: z.enum(VALUE_TYPES),
        unit: z.string().max(16),
        optionsText: z.string(),
        allowCustom: z.boolean(),
        salesSpec: z.boolean(),
        required: z.boolean(),
        identity: z.boolean(),
        filterable: z.boolean(),
        multi: z.boolean(),
    })
    .superRefine((value, ctx) => {
        const options = parseOptions(value.optionsText)
        if (value.valueType === "enum" && options.length === 0) {
            ctx.addIssue({
                code: "custom",
                path: ["optionsText"],
                message: err("category.form.err.optionsRequired").message,
            })
        }
        if (value.valueType === "number" && !value.unit.trim()) {
            ctx.addIssue({
                code: "custom",
                path: ["unit"],
                message: err("category.form.err.unitRequired").message,
            })
        }
        if (value.identity && value.valueType !== "enum" && value.valueType !== "number") {
            ctx.addIssue({
                code: "custom",
                path: ["identity"],
                message: err("category.form.err.identityType").message,
            })
        }
    })

export type AddAttributeFormValues = z.infer<typeof addAttributeFormSchema>

/** 编辑属性：只送契约收的可编辑元数据；valueType/code 创建后不可改（改了存量商品全对不上） */
export const editAttributeFormSchema = z.object({
    name: nameField,
    required: z.boolean(),
    filterable: z.boolean(),
    multi: z.boolean(),
    allowCustom: z.boolean(),
    sort: z.string().refine((raw) => /^-?\d+$/.test(raw.trim()), err("category.form.err.sortInt")),
    status: z.enum(ATTR_STATUSES),
})
export type EditAttributeFormValues = z.infer<typeof editAttributeFormSchema>

/** 值域条目：新增要 value；编辑只收 imageUrl / sort / status（value 本身创建后不可改） */
export const addValueFormSchema = z.object({
    value: zCreateAttributeValueRequest.shape.value,
    imageUrl: z.string().max(1024),
})

export const editValueFormSchema = z.object({
    imageUrl: z.string().max(1024),
    sort: z.string().refine((raw) => /^-?\d+$/.test(raw.trim()), err("category.form.err.sortInt")),
    status: z.enum(ATTR_STATUSES),
})

/** optionsText → options：按行/逗号拆、去空去重；空串 = 没配 */
export function parseOptions(text: string | undefined): string[] {
    return [
        ...new Set(
            (text ?? "")
                .split(/[,\n，、]/)
                .map((s) => s.trim())
                .filter(Boolean),
        ),
    ]
}

/** 上限从契约那一格读，别抄第二个数 */
export const ATTR_NAME_MAX = nameField.maxLength ?? undefined
export const ATTR_CODE_MAX = codeField.maxLength ?? undefined
export const ATTR_VALUE_MAX = zCreateAttributeValueRequest.shape.value.maxLength ?? undefined

type AttrRuleKey = Extract<AdminMessageKey, `category.rules.${string}`>

/** 属性卡上的规则徽章：只印事实开关，visibleWhen 是另一回事（只读展示在卡片上） */
export function describeAttrRules(
    attr: CategoryAttributeView,
    t: (key: AttrRuleKey) => string,
): string {
    const rules = [
        attr.required ? t("category.rules.required") : undefined,
        attr.filterable ? t("category.rules.filterable") : undefined,
        attr.multi ? t("category.rules.multi") : undefined,
        attr.allowCustom ? t("category.rules.allowCustom") : undefined,
        attr.identity ? t("category.rules.identity") : undefined,
        attr.salesSpec ? t("category.rules.salesSpec") : undefined,
    ].filter(Boolean)
    return rules.length > 0 ? rules.join(" · ") : t("category.rules.none")
}

/** 属性转新增表单不存在的场景——编辑表单从视图行取默认值 */
export function editValuesOf(attr: CategoryAttributeView): EditAttributeFormValues {
    return {
        name: attr.name,
        required: attr.required,
        filterable: attr.filterable,
        multi: attr.multi,
        allowCustom: attr.allowCustom,
        sort: String(attr.sort),
        status: attr.status === "disabled" ? "disabled" : "active",
    }
}
