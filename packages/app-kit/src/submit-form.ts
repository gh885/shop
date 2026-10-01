import { captureError, isApiError } from "@shop/common"

/**
 * 表单提交的唯一出口：接住 `handleSubmit()` 的 rejection，并**按错误的种类分开处理**。
 *
 * <p>为什么需要它：`form-core` 的 `_handleSubmit` 在 `onSubmit` 抛错后会 `throw err`（它把
 * `isSubmitSuccessful` 置回 false、这是对的），而 `void form.handleSubmit()` 里的 `void` 只丢弃返回值、
 * **不接 rejection**——那条错误就变成未处理的异步异常。所以 `onSubmit` 里该 `throw` 的要 throw
 * （框架状态才诚实），接住它的责任在这个函数里，就一处。
 *
 * <p>两类错误，分开对待（这是它存在的全部理由）：
 *
 * 1. **错误体形状的那一类**（后端 ProblemDetail / 网络失败，`isApiError` 认）——提示已经由全局写操作
 *    反馈（mutation 的 `meta.error`）发出去了，静默吞掉是对的。这里再报一次就是**两次提示**。
 * 2. **其余一切**（`TypeError`、字段映射写错、金额换算炸了……）——**绝不能静默**：它们走不到
 *    `meta.error`，吞掉的结果是「用户点了提交，界面上什么都没发生」，而监控里也没有一条记录。
 *    这类上报 `form_submit_unexpected`，交给 `captureError`（自带同会话去重与限次）。
 *
 * <p>所以**不要在 `onSubmit` 里 `catch {}` 了事**：那正是第 2 类被吞掉的原因。`onSubmit` 只管
 * 「把字段级错误写到对应框上」，然后 `throw`；剩下的交给这里。
 *
 * <p>2026-10 已收口：三端表单与 app-kit 的共享表单（登录、`ReasonForm`）都走这里，
 * 仓库里不再有内联的 `void form.handleSubmit()`（细则见 docs/conventions/frontend.md）。
 *
 * @param form 表单实例（`useAppForm()` 的返回值）
 * @returns 一个**永不 reject** 的 promise：给 `void submitForm(form)` 用，
 *   `void` 在这里是「我不要结果」，而不是「我不接异常」
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
