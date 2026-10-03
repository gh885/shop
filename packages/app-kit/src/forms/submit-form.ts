import { captureError } from "@shop/common/monitoring"
import { isApiError } from "@shop/common/contract" /**
 * 表单提交的唯一出口：接住 `handleSubmit()` 的 rejection，并**按错误的种类分开处理**。
 *
 * `form-core` 的 `_handleSubmit` 在 `onSubmit` 抛错后会 `throw err`（它把 `isSubmitSuccessful` 置回
 * false、这是对的），而 `void form.handleSubmit()` 里的 `void` 只丢弃返回值、**不接 rejection**。
 * 所以 `onSubmit` 里该 `throw` 的要 throw（框架状态才诚实），接住它的责任在这个函数里，就一处。
 *
 * 两类错误，分开对待（这是它存在的全部理由）：
 * 1. **错误体形状的那一类**（`isApiError` 认）——提示已由全局写操作反馈（mutation 的 `meta.error`）
 *    发出去了，静默吞掉是对的；再报一次就是**两次提示**。
 * 2. **其余一切**（`TypeError`、字段映射写错、金额换算炸了……）——**绝不能静默**：它们走不到
 *    `meta.error`，吞掉的结果是「点了提交、界面上什么都没发生」而监控里没有一条记录。这类上报
 *    `form_submit_unexpected`（`captureError` 自带同会话去重与限次）。
 *
 * 所以**不要在 `onSubmit` 里 `catch {}` 了事**——那正是第 2 类被吞掉的原因：`onSubmit` 只管把
 * 字段级错误写到对应框上，然后 `throw`。
 *
 * 返回一个**永不 reject** 的 promise：给 `void submitForm(form)` 用，`void` 在这里是「我不要结果」，
 * 而不是「我不接异常」。
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
