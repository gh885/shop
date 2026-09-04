import { useAppForm } from "@shop/ui-web"

interface BasicStepValuesRef {
    images: string[]
    name: string
    subtitle: string
    detailImages: string[]
}

/**
 * 真「表单实例类型”锚点“」——从 useAppForm 的返回推导出可复用类型。
 *
 * TanStack Form 的 useAppForm 返回类型随 defaultValues/onSubmit 逐层泛型推导，直接写
 * ReturnType<typeof useAppForm> 会退化。这里用 `typeof useBasicForm` 让 ts 从 defaultValues 稳定
 * 推导出带 AppField、数据为 BasicStepValues 的实例类型；关键是与真实调用保持 **相同的 onSubmit 签名**
 * （含 value 参数），使 TOnSubmit 泛型一致，从而两个 form 类型可直接赋值、无需 cast。
 */
function useBasicForm() {
    return useAppForm({
        defaultValues: {
            images: [],
            name: "",
            subtitle: "",
            detailImages: [],
        } as BasicStepValuesRef,
        onSubmit: ({ value }) => void value,
    })
}

export type BasicForm = ReturnType<typeof useBasicForm>
