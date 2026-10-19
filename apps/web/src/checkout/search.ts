import { z } from "zod"

export const checkoutSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    lines: z
        .array(z.object({ skuId: z.string(), quantity: z.coerce.number().int().positive() }))
        .catch([]),
})
