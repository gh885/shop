import type {
    ShippingTemplateFeeTier,
    ShippingTemplateRequest,
    ShippingTemplateResponse,
} from "@shop/api/sdk"
import { type Money, moneyToYuan, yuanToMoney } from "@shop/common/domain"

import {
    EMPTY_FEE_TIER,
    ShippingTemplateFormSchema,
    type FeeTierFormValue,
    type ShippingTemplateFormValues,
} from "./form"

/** 本域业务逻辑出口（frontend.md「文件名即分层」的 rules 槽位）：语言无关的 wire↔表单投影与元↔分换算。zod schema 与校验消息在 form.ts */

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

// ---- 换算：表单字符串 → 请求体。走到这里已过 form.ts 的校验，yuanToMoney 不可能返回 undefined ----
// 真返回了说明校验和换算读的不是同一套规则（改了上面忘了下面），宁可炸也别把 undefined 发给后端

function moneyOf(text: string): Money {
    const money = yuanToMoney(text)
    if (money === undefined) throw new Error(`金额格式不正确：${text}`)
    return money
}

function feeTierToWire(tier: FeeTierFormValue): {
    firstQuantity: number
    firstFee: Money
    addQuantity: number
    addFee: Money
} {
    return {
        firstQuantity: Number(tier.firstQuantity),
        firstFee: moneyOf(tier.firstFee),
        addQuantity: Number(tier.addQuantity),
        addFee: moneyOf(tier.addFee),
    }
}

export function shippingTemplateRequestFromForm(
    values: ShippingTemplateFormValues,
): ShippingTemplateRequest {
    // parse 只为抛错与取 trim 后的值；输出形状与入参相同，换算在下面显式做
    const form = ShippingTemplateFormSchema.parse(values)
    return {
        freeShipping: form.freeShipping,
        // 包邮开着时那两格不生效：填了也不提交
        freeOverQuantity:
            form.freeShipping || form.freeOverQuantity === ""
                ? undefined
                : Number(form.freeOverQuantity),
        freeOverAmount:
            form.freeShipping || form.freeOverAmount === ""
                ? undefined
                : moneyOf(form.freeOverAmount),
        defaultRule: feeTierToWire(form.defaultRule),
        regionRules: form.regionRules.map((rule) => ({
            regionPrefixes: [...rule.regionPrefixes],
            ...feeTierToWire(rule),
        })),
        excludedRegions: [...new Set(form.excludedRegions)],
    }
}
