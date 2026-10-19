import { ShopReviewStatus } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"

const ShopReviewStatusSchema = z.enum(ShopReviewStatus)

export const reviewSearchSchema = createPaginationSearchSchema(20).extend({
    status: ShopReviewStatusSchema.optional(),
})
export type ReviewSearch = z.infer<typeof reviewSearchSchema>
