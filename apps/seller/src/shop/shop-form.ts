import { z } from "zod"

import { SHOP_NAME_MAX } from "#/shop/constants"

/**
 * shop 域 · 表单层：店名那一格的校验（开店与被拒重提共用同一条规则）。
 *
 * 上限的权威是 `#/shop/constants` 里那个 `SHOP_NAME_MAX`——它由 apps/server 的
 * `FieldRuleVocabularyTest` 与 Java 常量、契约、迁移列宽逐边核对，所以这里只引用不另写数字；
 * 提示语里那个数也是插值出来的，改上限时那句话不会先变成谎报。
 */
export const CreateShopFormSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "请输入店铺名称")
        .max(SHOP_NAME_MAX, `店名最长 ${SHOP_NAME_MAX} 字`),
})
