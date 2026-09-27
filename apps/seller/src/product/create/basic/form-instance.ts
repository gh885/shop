import { useAppForm } from "@shop/ui-web"

import { EMPTY_PRODUCT_BASIC_FORM } from "#/product/draft-model"

/**
 * 真「表单实例类型”锚点“」——从 useAppForm 的返回推导出可复用类型。
 *
 * TanStack Form 的 useAppForm 返回类型随 defaultValues/onSubmit 逐层泛型推导，直接写
 * ReturnType<typeof useAppForm> 会退化。这里用 `typeof useBasicForm` 让 ts 从 defaultValues 稳定
 * 推导出带 AppField、数据为 ProductBasicForm 的实例类型；关键是与真实调用保持 **相同的 onSubmit 签名**
 * （含 value 参数），使 TOnSubmit 泛型一致，从而两个 form 类型可直接赋值、无需 cast。
 * defaultValues 直接借发布步骤那份常量：形状与「稳定引用」的要求两边一样，抄两遍就只是漂移源。
 */
function useBasicForm() {
    return useAppForm({
        defaultValues: EMPTY_PRODUCT_BASIC_FORM,
        onSubmit: ({ value }) => void value,
    })
}

export type BasicForm = ReturnType<typeof useBasicForm>
