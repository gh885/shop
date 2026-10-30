import { z } from "zod"

/**
 * 结算入参：`QuoteLine` 需要 `listingId`（服务端按 listing 算价），
 * `OrderLine` 还要 `merchantId`（下单按行归属商家）。购物车结算时把两者带上。
 */
export const checkoutSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    lines: z
        .array(
            z.object({
                skuId: z.string(),
                listingId: z.string(),
                merchantId: z.string(),
                quantity: z.coerce.number().int().positive(),
            }),
        )
        .catch([]),
})

/** 支付渠道回跳参数：支付宝只保证带回 out_trade_no，其余字段不参与判定 */
export const payReturnSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    out_trade_no: z.string().catch(""),
})
