import { useAppForm } from "@shop/ui-web"

import { EMPTY_PRODUCT_BASIC_FORM } from "#/product/draft-model"

// 从 useAppForm 推导可复用实例类型：直接写 ReturnType<typeof useAppForm> 会退化，故用 typeof useBasicForm 让 ts 稳定推导；关键是保持与真实调用相同的 onSubmit 签名（含 value 参数），两个 form 类型才能直接赋值、无需 cast
function useBasicForm() {
    return useAppForm({
        defaultValues: EMPTY_PRODUCT_BASIC_FORM,
        onSubmit: ({ value }) => void value,
    })
}

export type BasicForm = ReturnType<typeof useBasicForm>
