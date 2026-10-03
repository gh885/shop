import type { CategoryAttrResponse } from "@shop/api/sdk"
import { zCategoryAttrRequest, zCategoryAttrValueRequest } from "@shop/api"
import { z } from "zod"

import type { AdminMessageKey } from "#/locales/messages.gen"

/**
 * 属性模板的校验同样取契约镜像：名称/取值上限由 `maxLength` 给，只补一条「非空」。
 * 三个开关在契约里是可选的（不传 = 沿用默认），表单里必须是确定的布尔——不然「没勾」和「没填」就混在一起了。
 *
 * 三个开关的摘要文案也放在这一格里：它读的就是这四个字段（kind 之外那三个布尔），
 * 与表单是同一个概念的读侧与写侧——分两处写就会长出不一样的措辞与不一样的「一个都没开时说什么」。
 */
export const attrFormSchema = z.object({
    name: zCategoryAttrRequest.shape.name.refine(
        (value) => value.trim().length > 0,
        "请填写属性名称",
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
        "请填写取值",
    ),
    // 契约里 image 可选；表单里空串 = 不配图，所以拆掉 optional 只留形状与上限
    image: zCategoryAttrValueRequest.shape.image.unwrap(),
})

/** 输入框的字符上限从契约那一格读，不抄第二个数（抄来的那份在契约放宽时不会跟着走） */
export const ATTR_NAME_MAX = zCategoryAttrRequest.shape.name.maxLength ?? undefined
export const ATTR_VALUE_MAX = zCategoryAttrValueRequest.shape.value.maxLength ?? undefined

/** 三个开关的片段 key；一个都没开时给一句「无附加规则」，好过留白 */
type AttrRuleKey = Extract<AdminMessageKey, `admin.category.rules.${string}`>

/**
 * 三个开关的摘要。`t` 作参数传入（§3.5：非组件模块不碰 process-global 的翻译器），
 * 与渲染点用的是同一个本端 `t`。分隔符「 · 」是中性标点，跟语言无关，留在代码里。
 */
export function describeAttrRules(
    attr: CategoryAttrResponse,
    t: (key: AttrRuleKey) => string,
): string {
    const rules = [
        attr.required ? t("admin.category.rules.required") : undefined,
        attr.allowCustom ? t("admin.category.rules.allowCustom") : undefined,
        attr.allowImage ? t("admin.category.rules.allowImage") : undefined,
    ].filter(Boolean)
    return rules.length > 0 ? rules.join(" · ") : t("admin.category.rules.none")
}
