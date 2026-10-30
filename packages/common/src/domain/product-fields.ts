/**
 * product-fields —— 商品标题与卖点的字段口径，卖家端各处表单共用一份。
 *
 * 标题长度直接引用 @shop/api/schemas，前端不再抄数。卖点允许空串，其区间只存在于后端正则中；
 * SELL_POINT_MAX 暂保留手写值，与 ProductFieldRules 的正则核对。表单的必填、trim 与提示语不由生成器决定。
 *
 * **提示语不在这里**（2026-10 改）：旧版这里抄着后端那两条中文 message（标题那条把上限拼进了句子、
 * 卖点那条写了字数区间），理由是「后端把上限拼进了 message，两边各写一遍就各改一遍」。
 * §7.3 之后那句中文到不了用户眼前——句子由 catalog 按界面语言出（`validation.{REQUIRED,MIN_LENGTH,MAX_LENGTH}`），
 * 上限作为**数据**进 `{max}` 槽位，改数字时前端零改动。留一份中文字面量等于给英文界面留一句中文。
 *
 * 字段**标签**不在这里统一：发布页叫「商品卖点」、改标题弹窗叫「导购标题」，那是入口文案而不是规则。
 */

import { CreateProductRequestSchema } from "@shop/api/schemas"
import { z } from "zod"

import { VALIDATION_RULES } from "../contract/validation-rules"
import { withMaxLength } from "./length-rules"

/** 商品标题上限（后端 `ProductFieldRules.NAME_MAX`）：搜索召回的关键词位，写长了卡片也放不下 */
export const PRODUCT_NAME_MAX = CreateProductRequestSchema.properties.title.maxLength

/** 卖点上限（后端 `ProductFieldRules.SELL_POINT_PATTERN` 的 `{10,30}` 上界） */
export const SELL_POINT_MAX = 30

/** 商品标题：必填 + 上限。草稿期后端允许空名，必填这一条是表单侧的发布前置检查 */
export const ProductNameSchema = withMaxLength(
    z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
    PRODUCT_NAME_MAX,
)
