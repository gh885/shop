import { captureError } from "@shop/monitoring"
import { isApiError } from "@shop/common/contract"

/**
 * 表单提交唯一出口：接 handleSubmit 的 rejection，按错误种类分开——isApiError 认的已被全局 meta.error 提示过，静默（再报=两次）；其余（TypeError 等代码坏了）走不到 meta.error，吞掉=「点了没反应」且监控无痕，必须 captureError
 * onSubmit 里该 throw 的 throw（form-core 据此置 isSubmitSuccessful=false），别 catch{} 了事（那正是第 2 类被吞的原因）；返回值永不 reject，给 void 用安全
 */
export function submitForm(form: { handleSubmit: () => Promise<unknown> }): Promise<void> {
    return form
        .handleSubmit()
        .then(() => {})
        .catch((error: unknown) => {
            if (isApiError(error)) return
            captureError("custom", error, { message: "表单提交失败（非接口错误）" })
        })
}
