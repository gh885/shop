import type { AnyFormApi } from "@tanstack/react-form"

/**
 * 表单字段可承载的错误：可本地化的事实（catalog key + params）或已成句的字符串。
 *
 * `params` 的值类型刻意不收窄到 `string | number`：ui-web 不依赖 `@shop/common`，而事实由
 * app-kit 的 `serverFieldErrors` 产出（那边是 `MessageParams`）。收窄只会在两包之间造一次无收益的转换。
 */
export type ServerFieldError =
    | {
          message: string
          params?: Readonly<Record<string, unknown>>
      }
    | string

/**
 * 把后端 422 的字段级提示写进表单 —— **422 那一族第一次真正落到输入框上**。
 *
 * <p>此前各表单的字段标红全部来自本地 Zod，后端 422 里的 `errors[]` 没有任何一处消费：
 * 用户提交一个后端不认的值，看到的是一句全局 toast，而不是「哪个框红了、为什么」。
 * 现在后端给 `rule`（+ `min` / `max`），`@shop/app-kit` 的 `serverFieldErrors` 据此给出
 * **可本地化的事实**（`{ message: catalog key, params }`；认不出的 rule 降级为按 locale 的通用校验句，
 * 不再抄后端那句成句），本函数只负责**交给表单**。
 *
 * <p>交的是事实而不是句子：字段错误的句子由渲染层（`FieldError` → `FormErrorTranslateProvider`）
 * 按**当前**语言现换，于是切语言时已显示的服务端错误与本地 Zod 错误一起变（改版前这里收到的是
 * 提前翻好的字符串，切语言不变，同一页两种行为）。
 *
 * <p>用框架原生的 `setErrorMap({ onServer: { fields } })`，而不是自己循环 `setFieldMeta` 写
 * `errorMap.onServer` + `errorSourceMap.onServer`。这不是风格偏好，是**实测出来的行为差**：
 * 手写 fieldMeta 那一版在「表单级 validators.onSubmit + 字段自身没有 validator」这个组合下
 * （也就是本仓库所有表单的形状）改值**清不掉**那条服务端错误——错误一直挂在字段上，
 * `isValid` 与 `canSubmit` 永远为 false，**用户改完填对了也提交不了**（实测 1.33.5：
 * 手写版改值后 `canSubmit=false`，换成 setErrorMap 后 `true|true` 且错误消失）。
 * 交给 `setErrorMap` 之后，清理与「能不能再提交」由框架自己的错误源判定管，我们不掺和。
 *
 * <p>清空：`setErrorMap` 是整体替换，同一批 key 不再出现在 `errors` 里就等于清掉——
 * 上一轮挂在别的字段上的那条不会被留下（这也是不用手写循环的理由之一）。
 */

/**
 * @param form 表单实例（`useAppForm()` 的返回值）
 * @param errors 表单字段名 → 可本地化的错误事实（`serverFieldErrors` 的产物；裸字符串是留给调用方自带句子的口子）
 */
export function applyServerFieldErrors(
    form: AnyFormApi,
    errors: Readonly<Record<string, ServerFieldError>>,
): void {
    // 空对象也要调：setErrorMap 是替换语义，不调就等于「这一轮没有字段级错误」没有生效，
    // 上一轮的提示会一直挂着
    form.setErrorMap({ onServer: { fields: errors } })
}
