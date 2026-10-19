import { paginationSearchSchema } from "@shop/app-kit/data"

import { RefundTabSchema } from "./model"

export const refundListSearchSchema = paginationSearchSchema.extend({ status: RefundTabSchema })
