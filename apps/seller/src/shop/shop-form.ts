import { z } from "zod"

import { VALIDATION_RULES } from "@shop/common/contract"
import { withMaxLength } from "@shop/common/domain"

import { SHOP_NAME_MAX } from "#/shop/constants"

/**
 * shop 域 · 表单层：店名那一格的校验（开店与被拒重提共用同一条规则）。
 *
 * 上限的权威是 `#/shop/constants` 里那个 `SHOP_NAME_MAX`——它由 apps/server 的
 * `FieldRuleVocabularyTest` 与 Java 常量、契约、迁移列宽逐边核对，所以这里只引用不另写数字。
 * 句子走 `validation.{REQUIRED,MAX_LENGTH}`：那个数作为 `{max}` 槽位的数据出去（走 `withMaxLength`
 * 的 refine 通道——`.max()` 那条 check 会把 params 丢掉），改上限时前端零改动。
 */
export const CreateShopFormSchema = z.object({
    name: withMaxLength(
        z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
        SHOP_NAME_MAX,
    ),
})
