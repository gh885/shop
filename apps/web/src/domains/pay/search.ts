import { z } from "zod"

/** 支付渠道回跳参数：支付宝只保证带回 out_trade_no，其余字段不参与判定 */
export const payReturnSearchSchema = z.object({
    out_trade_no: z.string().catch(""),
})
