import { ShopStatus } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"
import { SHOP_KEYWORD_MAX, SHOP_OPS_PAGE_SIZE } from "./constants"

const ShopStatusSchema = z.enum(ShopStatus)

export const shopOpsSearchSchema = createPaginationSearchSchema(SHOP_OPS_PAGE_SIZE).extend({
    status: ShopStatusSchema.optional(),
    keyword: z.string().max(SHOP_KEYWORD_MAX).optional(),
})
export type ShopOpsSearch = z.infer<typeof shopOpsSearchSchema>
