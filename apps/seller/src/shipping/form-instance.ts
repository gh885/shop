import { useAppForm } from "@shop/ui-web"

import { shippingTemplateFormFromResponse, ShippingTemplateFormSchema } from "./model"

/**
 * 运费模板表单的**实例类型锚点**——从一次与页面同形状的 `useAppForm` 调用推导，
 * 好让「把 form 传下去」的那些子组件（四格、逐条地区规则）能标出 `form.AppField` 的类型。
 *
 * 直接写 `ReturnType<typeof useAppForm>` 会退化：TanStack 的返回类型随 defaultValues / validators /
 * onSubmit 逐层推导，只有保持**相同的泛型参数**（含 `onSubmit` 的 `{ value }` 签名）才不用 cast。
 * 与 `apps/seller/src/product/create/basic/form-instance.ts` 是同一个手法。
 */
function useShippingForm() {
    return useAppForm({
        defaultValues: shippingTemplateFormFromResponse(undefined),
        validators: { onSubmit: ShippingTemplateFormSchema },
        onSubmit: async ({ value }) => void value,
    })
}

export type ShippingForm = ReturnType<typeof useShippingForm>

/** 四格所属的那一块：默认运费是对象路径，地区规则是数组下标路径（方括号） */
export type FeeTierPrefix = "defaultRule" | `regionRules[${number}]`
