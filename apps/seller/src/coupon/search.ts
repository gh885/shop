import { paginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"

export const couponListSearchSchema = paginationSearchSchema

export type CouponListSearch = z.infer<typeof couponListSearchSchema>
