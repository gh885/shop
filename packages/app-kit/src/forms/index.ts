/**
 * forms —— 表单设施：submitForm（提交接线，接 rejection + 上报「代码坏了」那类）、
 * FormActions / ReasonForm、服务端字段级错误的落点事实（serverFieldErrors，
 * 422 errors 那条链见 docs/conventions/i18n.md）、RegionField（区划码是唯一进出字段）、
 * useUnsavedLeaveGuard（脏表单离开确认）。约定条文在 frontend.md「表单」。
 */
export { FormActions } from "./form-actions"
export { ReasonForm } from "./reason-form"
export { RegionField } from "./region-field"
export { serverFieldErrors } from "./server-field-errors"
export type { ServerFieldErrorValue, ServerFieldMap } from "./server-field-errors"
export { submitForm } from "./submit-form"
export { regionCascaderTreeOptions } from "./region-query"
export { useUnsavedLeaveGuard } from "./use-unsaved-leave"
