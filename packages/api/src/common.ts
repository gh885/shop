import { z } from "zod"

/**
 * 金额值对象（对等后端 common.Money）：amount 以「分」计，currency 为 ISO 币种码。
 * 买家侧商品 / 未来订单接口的金额字段都走这个形状（price.amount / price.currency），不裸传 number。
 * 契约与后端 common/Money.java 保持一致。
 */
export const MoneySchema = z.object({
    amount: z.number().int().min(0),
    currency: z.string().min(1),
})
export type Money = z.infer<typeof MoneySchema>

/** 后端统一错误响应 */
export const ApiErrorSchema = z.object({
    title: z.string().optional(),
    status: z.number(),
    detail: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    errors: z
        .array(
            z.object({
                field: z.string(),
                message: z.string(),
            }),
        )
        .optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>
