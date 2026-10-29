import type { Region, ShippingTemplateRequest, TemplateView } from "@shop/api/sdk"
import { type Money, moneyToYuan, yuanToMoney } from "@shop/common/domain"

import {
    EMPTY_REGION_RULE,
    ShippingTemplateFormSchema,
    type ShippingTemplateFormValues,
} from "./form"

/** 本域业务逻辑出口（rules 槽位）：语言无关的 wire↔表单投影与元↔分换算。zod schema 与校验消息在 form.ts */

/** 模板状态：草稿可改，启用后才影响算价，归档是启用的前一版。 */
export type ShippingTemplateStatus = "draft" | "active" | "archived"

function emptyShippingTemplateForm(): ShippingTemplateFormValues {
    return {
        name: "",
        chargeBy: "piece",
        freeOver: "",
        // 后端库约束要求至少一条默认规则（areaCodes 空）：新建时先给这一条，不让用户面对一个存不下的空表单
        regionRules: [{ id: "default", areaCodes: [], ...EMPTY_REGION_RULE }],
    }
}

export function shippingTemplateFormFromResponse(
    response: TemplateView | null | undefined,
): ShippingTemplateFormValues {
    if (!response) return emptyShippingTemplateForm()

    return {
        name: response.name,
        chargeBy: response.chargeBy === "weight" ? "weight" : "piece",
        // 后端 freeOver 是分（0 = 不设门槛）
        freeOver:
            response.freeOver === 0
                ? ""
                : moneyToYuan({ amount: response.freeOver, currency: "CNY" }),
        regionRules: response.regions.map((region, index) => ({
            id: `r-${index}`,
            areaCodes: [...(region.areaCodes ?? [])],
            firstQuantity: String(region.first ?? 1),
            firstFee: moneyToYuan({ amount: region.firstFee ?? 0, currency: "CNY" }),
            addQuantity: String(region.additional ?? 1),
            addFee: moneyToYuan({ amount: region.additionalFee ?? 0, currency: "CNY" }),
        })),
    }
}

function moneyOf(text: string): Money {
    const money = yuanToMoney(text)
    if (money === undefined) throw new Error(`金额格式不正确：${text}`)
    return money
}

function regionToWire(rule: ShippingTemplateFormValues["regionRules"][number]): Region {
    return {
        areaCodes: [...rule.areaCodes],
        first: Number(rule.firstQuantity),
        firstFee: moneyOf(rule.firstFee).amount,
        additional: Number(rule.addQuantity),
        additionalFee: moneyOf(rule.addFee).amount,
    }
}

/**
 * 表单 → 请求体。`shopId` 由调用方给（模板归属店铺是路由上下文，不是表单字段）。
 *
 * <p>`freeOver` 是分：空串 = 0 = 不设门槛，与后端 {@code freeOver >= 0} 的语义一致。
 */
export function shippingTemplateRequestFromForm(
    shopId: string,
    values: ShippingTemplateFormValues,
): ShippingTemplateRequest {
    // parse 只为抛错与取 trim 后的值；输出形状与入参相同，换算在下面显式做
    const form = ShippingTemplateFormSchema.parse(values)
    return {
        shopId,
        name: form.name,
        chargeBy: form.chargeBy,
        freeOver: form.freeOver === "" ? 0 : moneyOf(form.freeOver).amount,
        regions: form.regionRules.map(regionToWire),
    }
}

/** 页面上给人看的状态词。后端 status 是裸字符串，词表住这里。 */
export function shippingStatusOf(response: TemplateView): ShippingTemplateStatus {
    return response.status === "active" || response.status === "archived"
        ? response.status
        : "draft"
}
