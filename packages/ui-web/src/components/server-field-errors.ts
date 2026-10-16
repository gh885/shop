import type { AnyFormApi } from "@tanstack/react-form"

/**
 * 表单字段可承载的错误：可本地化的事实（catalog key + params）或已成句的字符串。
 * params 值类型刻意不收窄到 string|number：ui-web 不依赖 @shop/common，事实由 app-kit 的 serverFieldErrors 产出（那边是 MessageParams），收窄只在两包间造一次无收益的转换。
 */
export type ServerFieldError =
    | {
          message: string
          params?: Readonly<Record<string, unknown>>
      }
    | string

/**
 * 把后端 422 的字段级提示写进表单 —— 422 那一族第一次真正落到输入框上（此前字段标红全来自本地 Zod，后端 errors[] 无人消费，用户提交后端不认的值只看到全局 toast，不知哪个框红、为什么）。
 * 交的是事实不是句子：句子由渲染层（FieldError → FormErrorTranslateProvider）按当前语言现换，切语言时已显示的服务端错误与本地 Zod 错误一起变。
 * 用框架原生 setErrorMap({ onServer: { fields } })，而非手写循环 setFieldMeta——这是实测的行为差：手写版在「表单级 validators.onSubmit + 字段无 validator」（即本仓库所有表单形状）下改值清不掉那条服务端错误，isValid/canSubmit 永远 false，用户改对也提交不了（1.33.5）。setErrorMap 是整体替换，同一批 key 不再出现即等于清掉。
 */
export function applyServerFieldErrors(
    form: AnyFormApi,
    errors: Readonly<Record<string, ServerFieldError>>,
): void {
    // 空对象也要调：setErrorMap 是替换语义，不调等于「本轮无字段级错误」没生效，上一轮提示会一直挂着
    form.setErrorMap({ onServer: { fields: errors } })
}
