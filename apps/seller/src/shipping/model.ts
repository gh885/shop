import type {
    ShippingFeeTier,
    ShippingTemplateFeeTier,
    ShippingTemplateRequest,
} from "@shop/api/sdk"
import { fenToYuan, yuanToFen } from "@shop/common"

import type { ShippingTemplate } from "./data"

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

export function emptyShippingTemplateForm(): ShippingTemplateFormValues {
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
        firstFee: fenToYuan(rule.firstFee.amount),
        addQuantity: String(rule.addQuantity),
        addFee: fenToYuan(rule.addFee.amount),
    }
}

/** 响应形状 → 页面表单形状：Money 元、平铺数值、响应规则嵌套 rule 在这里拍平 */
export function shippingTemplateFormFromResponse(
    response: ShippingTemplate | null | undefined,
): ShippingTemplateFormValues {
    if (!response) return emptyShippingTemplateForm()

    return {
        freeShipping: response.freeShipping,
        freeOverQuantity:
            response.freeOverQuantity == null ? "" : String(response.freeOverQuantity),
        freeOverAmount:
            response.freeOverAmount == null ? "" : fenToYuan(response.freeOverAmount.amount),
        defaultRule: feeTierFromWire(response.defaultRule),
        regionRules: response.regionRules.map((item) => ({
            id: item.rule.id,
            regionPrefixes: [...item.regionPrefixes],
            ...feeTierFromWire(item.rule),
        })),
        excludedRegions: [...response.excludedRegions],
    }
}

function parseQuantity(value: string, label: string): number {
    const quantity = Number(value)
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error(`${label}必须是大于等于 1 的整数`)
    }
    return quantity
}

function parseFee(value: string, label: string): number {
    const fee = yuanToFen(value)
    if (fee === undefined) {
        throw new Error(`${label}格式不正确，请输入不小于 0 的金额`)
    }
    return fee
}

function feeTierToWire(rule: FeeTierFormValue): ShippingFeeTier {
    return {
        firstQuantity: parseQuantity(rule.firstQuantity, "首件"),
        firstFee: parseFee(rule.firstFee, "首费"),
        addQuantity: parseQuantity(rule.addQuantity, "续件"),
        addFee: parseFee(rule.addFee, "续费"),
    }
}

/** 表单校验：返回第一条用户可读错误；通过返回 undefined */
export function validateShippingTemplateForm(
    values: ShippingTemplateFormValues,
): string | undefined {
    try {
        feeTierToWire(values.defaultRule)

        if (!values.freeShipping) {
            if (values.freeOverQuantity.trim()) {
                parseQuantity(values.freeOverQuantity, "满件包邮门槛")
            }
            if (values.freeOverAmount.trim()) {
                parseFee(values.freeOverAmount, "满额包邮门槛")
            }
        }

        const charged = new Set<string>()
        values.regionRules.forEach((rule, index) => {
            if (rule.regionPrefixes.length === 0) {
                throw new Error(`第 ${index + 1} 条指定地区运费还没有选择地区`)
            }
            feeTierToWire(rule)
            for (const prefix of rule.regionPrefixes) {
                if (charged.has(prefix)) {
                    throw new Error(`地区编码 ${prefix} 配置了多条运费规则`)
                }
                charged.add(prefix)
            }
        })

        for (const prefix of values.excludedRegions) {
            if (charged.has(prefix)) {
                throw new Error(`地区编码 ${prefix} 已配置运费规则，不能再设为不配送`)
            }
        }
        return undefined
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}

/** 页面表单形状 → 后端请求：元转分、嵌套结构拍平、前端 id 不提交 */
export function shippingTemplateRequestFromForm(
    values: ShippingTemplateFormValues,
): ShippingTemplateRequest {
    return {
        freeShipping: values.freeShipping,
        freeOverQuantity:
            !values.freeShipping && values.freeOverQuantity.trim()
                ? parseQuantity(values.freeOverQuantity, "满件包邮门槛")
                : undefined,
        freeOverAmount:
            !values.freeShipping && values.freeOverAmount.trim()
                ? parseFee(values.freeOverAmount, "满额包邮门槛")
                : undefined,
        defaultRule: feeTierToWire(values.defaultRule),
        regionRules: values.regionRules.map((rule) => ({
            regionPrefixes: [...rule.regionPrefixes],
            ...feeTierToWire(rule),
        })),
        excludedRegions: [...new Set(values.excludedRegions)],
    }
}
