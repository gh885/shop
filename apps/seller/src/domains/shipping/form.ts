import { z } from "zod"

import { yuanToMoney } from "@shop/common/domain"
import { messageFactFactory, type MessageFact } from "@shop/i18n"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

/** 本域表单契约唯一出口（form 槽位）：zod schema 与校验消息。判定与 wire↔表单投影在 rules.ts */

type ShippingErrKey = Extract<SellerMessageKey, `shipping.err.${string}`>
const fact = messageFactFactory<ShippingErrKey, SellerParamsByKey>()

const err = (issue: MessageFact<ShippingErrKey>) => ({ code: "custom" as const, ...issue })

// 与后端同值：首件/续件至少 1（空串不能默默当 1）
function isWholeAtLeastOne(value: string): boolean {
    const quantity = Number(value)
    return Number.isInteger(quantity) && quantity >= 1
}

// ---- 校验：只判能不能过，输出与输入同形（全是表单里的字符串），不换算 ----
// 元↔分、字符串→number 一律留给 rules.ts：校验器懂 Money 就会连带懂币种与时区，一处改动要同时想两边

const quantityField = (issue: MessageFact<ShippingErrKey>) =>
    z.string().trim().refine(isWholeAtLeastOne, issue)

const moneyTextField = (issue: MessageFact<ShippingErrKey>) =>
    z
        .string()
        .trim()
        .refine((value) => yuanToMoney(value) !== undefined, issue)

const RegionRuleSchema = z.object({
    // id 仅前端列表 key，不提交后端
    id: z.string(),
    // 空数组 = 默认规则（后端库约束要求必须有一条）；非空 = 命中这些区划前缀时用这套费率
    areaCodes: z.array(z.string()),
    firstQuantity: quantityField(fact("shipping.err.firstQuantityInt")),
    firstFee: moneyTextField(fact("shipping.err.firstFeeFormat")),
    addQuantity: quantityField(fact("shipping.err.addQuantityInt")),
    addFee: moneyTextField(fact("shipping.err.addFeeFormat")),
})

export const ShippingTemplateFormSchema = z
    .object({
        name: z
            .string()
            .trim()
            .refine((value) => value.length > 0, fact("shipping.err.nameRequired")),
        chargeBy: z.enum(["piece", "weight"]),
        // 满额包邮门槛（元）。空 = 不设门槛；后端 freeOver 是分
        freeOver: z.string().trim(),
        // 第一条恒为默认规则（areaCodes 空）
        regionRules: z.array(RegionRuleSchema).min(1),
    })
    .superRefine((value, ctx) => {
        if (value.freeOver !== "" && yuanToMoney(value.freeOver) === undefined) {
            ctx.addIssue({ ...err(fact("shipping.err.freeOverAmountFormat")), path: ["freeOver"] })
        }

        const charged = new Set<string>()
        value.regionRules.forEach((rule, index) => {
            const path = ["regionRules", index, "areaCodes"]
            // 默认规则（空 areaCodes）只能有一条：两条都兜底时后端无法判断用哪套费率
            if (rule.areaCodes.length === 0) {
                if (index !== 0) {
                    ctx.addIssue({
                        ...err(fact("shipping.err.regionMissing", { index: index + 1 })),
                        path,
                    })
                }
                return
            }
            for (const code of rule.areaCodes) {
                if (charged.has(code)) {
                    ctx.addIssue({
                        ...err(fact("shipping.err.duplicateRegion", { prefix: code })),
                        path,
                    })
                }
                charged.add(code)
            }
        })
    })

export type RegionRuleFormValue = z.infer<typeof RegionRuleSchema>

export type ShippingTemplateFormValues = z.infer<typeof ShippingTemplateFormSchema>

export const EMPTY_REGION_RULE: Omit<RegionRuleFormValue, "id" | "areaCodes"> = {
    firstQuantity: "1",
    firstFee: "0.00",
    addQuantity: "1",
    addFee: "0.00",
}
