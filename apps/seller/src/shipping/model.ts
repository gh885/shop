import { z } from "zod"

import type {
    ShippingTemplateFeeTier,
    ShippingTemplateRequest,
    ShippingTemplateResponse,
} from "@shop/api/sdk"
import { type Money, moneyToYuan, yuanToMoney } from "@shop/common/domain"

import { messageFactFactory, type MessageFact } from "@shop/common/i18n"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

/**
 * 运费模板表单：**一份 schema 同时负责校验与换算**。
 *
 * 迁移前是两套各跑一遍：`validateShippingTemplateForm` 用 `parseQuantity/parseFee` 拦一遍，
 * 提交时 `shippingTemplateRequestFromForm` 又调同一批函数一遍（靠 `throw` 兜住「第一遍没拦住」）。
 * 规则改一处就得记着改另一处，而且错误是一句 form 级的话，用户看不出是哪一格。
 * 现在校验与换算同在一个 `transform` 里（不合法就 `z.NEVER` 发结构化 issue），
 * 每条 issue 带 `path` 落到那一格自己那行红字（数组格必须用方括号命名）。
 */
type ShippingErrKey = Extract<SellerMessageKey, `shipping.err.${string}`>
const fact = messageFactFactory<ShippingErrKey, SellerParamsByKey>()

/**
 * Zod 的 issue 形状 = `code: "custom"` + 事实（`{ message, params }`）。所以这里收的是**事实**而不是 key：
 * key 的字面量留在调用点（`quantityField(fact("shipping.err.firstQuantityInt"))`），收窄与参数绑定
 * 都在那一步生效——传 key 进函数等于把这份绑定降回「一个联合类型」，那正是  要消掉的半截安全。
 */
const err = (issue: MessageFact<ShippingErrKey>) => ({ code: "custom" as const, ...issue })

/** 件数：整数且 ≥1（与后端 `@Min(1)` 同值）；空串按非法，沿用迁移前那句一起报 */
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

/** 金额：按元填、换算成分；`yuanToMoney` 认不出即非法（负数与乱字符都在这挡） */
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

/** 一档按件运费的四格：默认运费与每条地区规则共用同一份规则与同一批文案 key */
const FeeTierSchema = z.object({
    firstQuantity: quantityField(fact("shipping.err.firstQuantityInt")),
    firstFee: moneyField(fact("shipping.err.firstFeeFormat")),
    addQuantity: quantityField(fact("shipping.err.addQuantityInt")),
    addFee: moneyField(fact("shipping.err.addFeeFormat")),
})

const RegionRuleSchema = z.object({
    /** 仅前端列表 key，不提交后端 */
    id: z.string(),
    regionPrefixes: z.array(z.string()),
    ...FeeTierSchema.shape,
})

/**
 * 表单值 → 请求体的校验 + 换算（名字说 `Form` 而不是 `Request`：它校的是**表单值**，
 * `shippingTemplateRequestFromForm` 才是把它变成 wire 的那一步；也避开与 `@shop/api/schemas`
 * 生成的 `ShippingTemplateRequestSchema` 撞名——那个是契约形状，与这里不是一回事）。
 */
export const ShippingTemplateFormSchema = z
    .object({
        freeShipping: z.boolean(),
        // 那两格是**条件校验**：包邮开着时它们不参与计费，脏值也不该拦提交（迁移前就是这个口径，
        // `model.test.ts` 钉着）。所以形状层只收字符串，判格式与换算都放到下面两处按 freeShipping 走。
        freeOverQuantity: z.string().trim(),
        freeOverAmount: z.string().trim(),
        defaultRule: FeeTierSchema,
        regionRules: z.array(RegionRuleSchema),
        excludedRegions: z.array(z.string()),
    })
    // 跨格条款：每一条都落在「能改回来」的那一格上，而不是页面底部一句话
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
                // 重复是「这一条与前一条撞了」：报在后出现的那条上，改哪条都能消错
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

/** 响应形状 → 页面表单形状：Money 元、平铺数值、响应规则嵌套 rule 在这里拍平 */
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

/**
 * 表单值 → 后端请求：校验与换算都在这条 schema 的 `transform` 里，没有第二套规则。
 *
 * 调用点是提交出口（`validators.onSubmit` 已放行才会走到），所以这里的 `parse` 只可能因
 * 「绕过表单直接调本函数」而抛——那种情况下抛 `ZodError` 比静默发一个非法请求好。
 */
export function shippingTemplateRequestFromForm(
    values: ShippingTemplateFormValues,
): ShippingTemplateRequest {
    return ShippingTemplateFormSchema.parse(values)
}
