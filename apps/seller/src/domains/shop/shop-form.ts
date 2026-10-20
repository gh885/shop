import { z } from "zod"

import { VALIDATION_RULES } from "@shop/common/contract"
import { withMaxLength } from "@shop/common/domain"

import { SHOP_NAME_MAX } from "#/domains/shop/constants"

// 用 withMaxLength 而非 .max()：.max() 那条 check 会把 {max} 参数丢掉，句子只剩裸槽位
export const CreateShopFormSchema = z.object({
    name: withMaxLength(
        z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
        SHOP_NAME_MAX,
    ),
})
