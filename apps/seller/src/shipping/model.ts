import { z } from "zod"

import type {
    ShippingTemplateFeeTier,
    ShippingTemplateRequest,
    ShippingTemplateResponse,
} from "@shop/api/sdk"
import { type Money, moneyToYuan, yuanToMoney } from "@shop/common/domain"

import { messageFactFactory, type MessageFact } from "@shop/i18n"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

type ShippingErrKey = Extract<SellerMessageKey, `shipping.err.${string}`>
const fact = messageFactFactory<ShippingErrKey, SellerParamsByKey>()

const err = (issue: MessageFact<ShippingErrKey>) => ({ code: "custom" as const, ...issue })

// 与后端 @Min(1) 同值；空串按非法（缺件数不能默默当 1 收）
function isWholeAtLeastOne(value: string): boolean {
    const quantity = Number(value)
    return Number.isInteger(quantity) && quantity >= 1
}

function toQuantity(
    value: string,
    issue: MessageFact<ShippingErrKey>,
    ctx: z.RefinementCtx,
): number | typeof z.NEVER {
    if (!isWholeAtLeastOne(value)) {
        ctx.addIssue(err(issue))
        return z.NEVER
    }
    return Number(value)
}

// 金额按元填、只在这里换算成分（yuanToMoney）；负数与乱字符都在这一挡
function toMoney(
    value: string,
    issue: MessageFact<ShippingErrKey>,
    ctx: z.RefinementCtx,
): Money | typeof z.NEVER {
    const money = yuanToMoney(value)
    if (money === undefined) {
        ctx.addIssue(err(issue))
        return z.NEVER
    }
    return money
}

const quantityField = (issue: MessageFact<ShippingErrKey>) =>
    z
        .string()
        .trim()
        .transform((value, ctx) => toQuantity(value, issue, ctx))

const moneyField = (issue: MessageFact<ShippingErrKey>) =>
    z
        .string()
        .trim()
        .transform((value, ctx) => toMoney(value, issue, ctx))

const FeeTierSchema = z.object({
    firstQuantity: quantityField(fact("shipping.err.firstQuantityInt")),
    firstFee: moneyField(fact("shipping.err.firstFeeFormat")),
    addQuantity: quantityField(fact("shipping.err.addQuantityInt")),
    addFee: moneyField(fact("shipping.err.addFeeFormat")),
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
    .transform((value) => ({
        freeShipping: value.freeShipping,
        // 包邮开着时那两格不生效：填了也不提交；关着时能走到这里说明格式已被上面放行
        freeOverQuantity: value.freeShipping
            ? undefined
            : value.freeOverQuantity === ""
              ? undefined
              : Number(value.freeOverQuantity),
        freeOverAmount: value.freeShipping
            ? undefined
            : value.freeOverAmount === ""
              ? undefined
              : yuanToMoney(value.freeOverAmount),
        defaultRule: value.defaultRule,
        regionRules: value.regionRules.map((rule) => ({
            regionPrefixes: [...rule.regionPrefixes],
            firstQuantity: rule.firstQuantity,
            firstFee: rule.firstFee,
            addQuantity: rule.addQuantity,
            addFee: rule.addFee,
        })),
        excludedRegions: [...new Set(value.excludedRegions)],
    }))

export interface FeeTierFormValue {
    firstQuantity: string
    firstFee: string
    addQuantity: string
    addFee: string
}

export interface RegionRuleFormValue extends FeeTierFormValue {
    /** 仅前端列表 key，不提交后端 */
    id: string
    regionPrefixes: string[]
}

export interface ShippingTemplateFormValues {
    freeShipping: boolean
    freeOverQuantity: string
    freeOverAmount: string
    defaultRule: FeeTierFormValue
    regionRules: RegionRuleFormValue[]
    excludedRegions: string[]
}

export const EMPTY_FEE_TIER: FeeTierFormValue = {
    firstQuantity: "1",
    firstFee: "0.00",
    addQuantity: "1",
    addFee: "0.00",
}

function emptyShippingTemplateForm(): ShippingTemplateFormValues {
    return {
        freeShipping: false,
        freeOverQuantity: "",
        freeOverAmount: "",
        defaultRule: { ...EMPTY_FEE_TIER },
        regionRules: [],
        excludedRegions: [],
    }
}

function feeTierFromWire(rule: ShippingTemplateFeeTier): FeeTierFormValue {
    return {
        firstQuantity: String(rule.firstQuantity),
        firstFee: moneyToYuan(rule.firstFee),
        addQuantity: String(rule.addQuantity),
        addFee: moneyToYuan(rule.addFee),
    }
}

export function shippingTemplateFormFromResponse(
    response: ShippingTemplateResponse | null | undefined,
): ShippingTemplateFormValues {
    if (!response) return emptyShippingTemplateForm()

    return {
        freeShipping: response.freeShipping,
        freeOverQuantity:
            response.freeOverQuantity == undefined ? "" : String(response.freeOverQuantity),
        freeOverAmount: moneyToYuan(response.freeOverAmount),
        defaultRule: feeTierFromWire(response.defaultRule),
        regionRules: response.regionRules.map((item) => ({
            id: item.rule.id,
            regionPrefixes: [...item.regionPrefixes],
            ...feeTierFromWire(item.rule),
        })),
        excludedRegions: [...response.excludedRegions],
    }
}

// 校验与换算只有这条 schema 一份；走到这还是抛 ZodError，比静默发非法请求好——别包 try/catch 吞掉
export function shippingTemplateRequestFromForm(
    values: ShippingTemplateFormValues,
): ShippingTemplateRequest {
    return ShippingTemplateFormSchema.parse(values)
}
