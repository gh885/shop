import { z } from "zod"

export const checkoutSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    lines: z
        .array(z.object({ skuId: z.string(), quantity: z.coerce.number().int().positive() }))
        .catch([]),
})

/** 支付渠道回跳参数：支付宝只保证带回 out_trade_no，其余字段不参与判定 */
export const payReturnSearchSchema = z.object({
    out_trade_no: z.string().catch(""),
})
