import { useAppForm } from "@shop/ui-web"

import { shippingTemplateFormFromResponse, ShippingTemplateFormSchema } from "./model"

// ShippingForm 必须从一次与页面同泛型的 useAppForm 调用推导：直接 ReturnType<typeof useAppForm> 会退化，子组件要 cast
function useShippingForm() {
    return useAppForm({
        defaultValues: shippingTemplateFormFromResponse(undefined),
        validators: { onSubmit: ShippingTemplateFormSchema },
        onSubmit: async ({ value }) => void value,
    })
}

export type ShippingForm = ReturnType<typeof useShippingForm>

export type FeeTierPrefix = "defaultRule" | `regionRules[${number}]`
