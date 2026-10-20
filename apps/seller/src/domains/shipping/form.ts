import { z } from "zod"

import { yuanToMoney } from "@shop/common/domain"
import { messageFactFactory, type MessageFact } from "@shop/i18n"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

/** 本域表单契约唯一出口（frontend.md「文件名即分层」的 form 槽位）：zod schema 与校验消息。判定与 wire↔表单投影在 rules.ts */

type ShippingErrKey = Extract<SellerMessageKey, `shipping.err.${string}`>
const fact = messageFactFactory<ShippingErrKey, SellerParamsByKey>()

const err = (issue: MessageFact<ShippingErrKey>) => ({ code: "custom" as const, ...issue })

// 与后端 @Min(1) 同值；空串按非法（缺件数不能默默当 1 收）
function isWholeAtLeastOne(value: string): boolean {
    const quantity = Number(value)
    return Number.isInteger(quantity) && quantity >= 1
}

// ---- 校验：只判能不能过，输出与输入同形（全是表单里的字符串），不换算 ----
// 元↔分、字符串→number 一律留给 rules.ts 的 shippingTemplateRequestFromForm：校验器懂 Money 就会连带懂币种与时区，
// 一处改动要同时想两边。这两条带数字的条款走 refine 而不是 .min()/.max()：check 通道会丢 params，句子里的数字填不上。

const quantityField = (issue: MessageFact<ShippingErrKey>) =>
    z.string().trim().refine(isWholeAtLeastOne, issue)

const moneyTextField = (issue: MessageFact<ShippingErrKey>) =>
    z
        .string()
        .trim()
        .refine((value) => yuanToMoney(value) !== undefined, issue)

const FeeTierSchema = z.object({
    firstQuantity: quantityField(fact("shipping.err.firstQuantityInt")),
    firstFee: moneyTextField(fact("shipping.err.firstFeeFormat")),
    addQuantity: quantityField(fact("shipping.err.addQuantityInt")),
    addFee: moneyTextField(fact("shipping.err.addFeeFormat")),
})

const RegionRuleSchema = z.object({
    // id 仅前端列表 key，不提交后端
    id: z.string(),
    regionPrefixes: z.array(z.string()),
    ...FeeTierSchema.shape,
})

export const ShippingTemplateFormSchema = z
    .object({
        freeShipping: z.boolean(),
        // 条件校验：包邮开着时这两格不参与计费，形状层只收字符串；无条件加格式校验会把脏值误拦在提交前
        freeOverQuantity: z.string().trim(),
        freeOverAmount: z.string().trim(),
        defaultRule: FeeTierSchema,
        regionRules: z.array(RegionRuleSchema),
        excludedRegions: z.array(z.string()),
    })
    .superRefine((value, ctx) => {
        if (!value.freeShipping) {
            // 留空 = 不设这条门槛（合法）；填了才判格式
            if (value.freeOverQuantity !== "" && !isWholeAtLeastOne(value.freeOverQuantity)) {
                ctx.addIssue({
                    ...err(fact("shipping.err.freeOverQuantityInt")),
                    path: ["freeOverQuantity"],
                })
            }
            if (value.freeOverAmount !== "" && yuanToMoney(value.freeOverAmount) === undefined) {
                ctx.addIssue({
                    ...err(fact("shipping.err.freeOverAmountFormat")),
                    path: ["freeOverAmount"],
                })
            }
        }

        const charged = new Set<string>()
        value.regionRules.forEach((rule, index) => {
            const path = ["regionRules", index, "regionPrefixes"]
            if (rule.regionPrefixes.length === 0) {
                ctx.addIssue({
                    ...err(fact("shipping.err.regionMissing", { index: index + 1 })),
                    path,
                })
                return
            }
            for (const prefix of rule.regionPrefixes) {
                if (charged.has(prefix)) {
                    ctx.addIssue({
                        ...err(fact("shipping.err.duplicateRegion", { prefix })),
                        path,
                    })
                }
                charged.add(prefix)
            }
        })
        for (const prefix of value.excludedRegions) {
            if (charged.has(prefix)) {
                ctx.addIssue({
                    ...err(fact("shipping.err.excludedConflict", { prefix })),
                    path: ["excludedRegions"],
                })
            }
        }
    })

// 类型从 schema 推：校验输出与表单值同形（换算在 rules.ts 显式做），
// 手写一遍接口就是给「schema 改了接口没改」留一条静默漂移的路
export type FeeTierFormValue = z.infer<typeof FeeTierSchema>

export type ShippingTemplateFormValues = z.infer<typeof ShippingTemplateFormSchema>

export const EMPTY_FEE_TIER: FeeTierFormValue = {
    firstQuantity: "1",
    firstFee: "0.00",
    addQuantity: "1",
    addFee: "0.00",
}
