import type { AnyFormApi } from "@tanstack/react-form"

/**
 * 把后端 422 的字段级提示写进表单 —— **422 那一族第一次真正落到输入框上**。
 *
 * <p>此前各表单的字段标红全部来自本地 Zod，后端 422 里的 `errors[]` 没有任何一处消费：
 * 用户提交一个后端不认的值，看到的是一句全局 toast，而不是「哪个框红了、为什么」。
 * 现在后端给 `rule`（+ `min` / `max`），文案由 `@shop/app-kit` 的 `serverFieldErrorTexts`
 * 按界面语言出，本函数只负责**交给表单**。
 *
 * <p>用框架原生的 `setErrorMap({ onServer: { fields } })`，而不是自己循环 `setFieldMeta` 写
 * `errorMap.onServer` + `errorSourceMap.onServer`。这不是风格偏好，是**实测出来的行为差**：
 * 手写 fieldMeta 那一版在「表单级 validators.onSubmit + 字段自身没有 validator」这个组合下
 * （也就是本仓库所有表单的形状）改值**清不掉**那条服务端错误——错误一直挂在字段上，
 * `isValid` 与 `canSubmit` 永远为 false，**用户改完填对了也提交不了**（实测 1.33.5：
 * 手写版改值后 `canSubmit=false`，换成 setErrorMap 后 `true|true` 且错误消失）。
 * 交给 `setErrorMap` 之后，清理与「能不能再提交」由框架自己的错误源判定管，我们不掺和。
 *
 * <p>清空：`setErrorMap` 是整体替换，同一批 key 不再出现在 `texts` 里就等于清掉——
 * 上一轮挂在别的字段上的那条不会被留下（这也是不用手写循环的理由之一）。
 */

/**
 * @param form 表单实例（`useAppForm()` 的返回值）
 * @param texts 表单字段名 → 那句话（`serverFieldErrorTexts` 的产物）
 */
export function applyServerFieldErrors(form: AnyFormApi, texts: Record<string, string>): void {
    // 空对象也要调：setErrorMap 是替换语义，不调就等于「这一轮没有字段级错误」没有生效，
    // 上一轮的提示会一直挂着
    form.setErrorMap({ onServer: { fields: texts } })
}
