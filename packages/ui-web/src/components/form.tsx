import * as React from "react"
import { createFormHook, createFormHookContexts } from "@tanstack/react-form"

import { Button } from "src/components/ui/button"
import { Input } from "src/components/ui/input"
import { FieldDescription, FieldError, FieldLabel } from "src/components/ui/field"
import { Label } from "src/components/ui/label"
import { Textarea } from "src/components/ui/textarea"
import { Select, SelectContent, SelectTrigger, SelectValue } from "src/components/ui/select"
import { Checkbox } from "src/components/ui/checkbox"
import { cn } from "src/lib/utils"

/**
 * 表单基础设施（基于 TanStack Form 官方 createFormHook + fieldComponents 模式）
 *
 * 设计目标：把「render-prop 样板 + label/错误/控件接线」一步步吞进字段组件，
 * 业务侧只剩声明式 JSX：
 *
 * ```tsx
 * const form = useAppForm({ defaultValues: {...}, onSubmit: ... });
 *
 * <form.AppForm>
 *     <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
 *         <form.AppField name="receiver">
 *             {(field) => (
 *                 <field.TextField label="收货人姓名" required placeholder="请输入" />
 *             )}
 *         </form.AppField>
 *         <form.AppField name="regionCode">
 *             {(field) => (
 *                 <field.SelectField label="所在地区" required>
 *                     <SelectItem value="..." ... />
 *                 </field.SelectField>
 *             )}
 *         </form.AppField>
 *         <form.AppField name="isDefault">
 *             {(field) => (
 *                 <field.CheckboxField label="设置为默认收货地址" />
 *             )}
 *         </form.AppField>
 *         <form.SubmitButton>保存</form.SubmitButton>
 *     </form>
 * </form.AppForm>
 * ```
 *
 * 约定：
 * - 校验统一放在 `form.AppField name="x" validators={...}`，错误文案取自 Zod message
 * - 字段组件封装了 value / onChange / onBlur 接线、label、必填红星、行内错误
 * - 高度定制化的字段（登录页 `+86` 前缀、内嵌按钮等）退回裸 `form.AppField` render-prop，
 *   `firstFieldError(field)` + `<FieldShell>` 组合即可，不必硬套字段组件
 */

const { fieldContext, formContext, useFormContext, useFieldContext } = createFormHookContexts()

// 错误归一化（zod issue / string / 其他）
function errorMessage(error: unknown): string {
    if (typeof error === "string") return error
    if (typeof error === "object" && error !== null && "message" in error) {
        return String(error.message)
    }
    return String(error)
}

/** 取字段首个校验错误的用户可读文案（无错误返回 undefined）。供 AppField / 字段组件渲染行内错误用 */
export function firstFieldError(field: {
    state: { meta: { errors: unknown[] } }
}): string | undefined {
    const error = field.state.meta.errors[0]
    return error === undefined ? undefined : errorMessage(error)
}

// 布局与错误展示：label / 说明 / 错误三片皮肤归 ui/field，这一层只剩容器和密度

/**
 * 字段布局壳：label（必填红星）+ 控件 + 行内错误。
 * 字段组件默认用它渲染；自定义 render-prop 场景也可单独复用。
 *
 * 名字族约定：`Field*`（ui/field）= 展示原语，`XxxField` = 接了表单的控件，
 * 这一层既不是原语也不是控件，是两者的组装品，故叫 Shell 而不占 `Field`。
 * 容器（gap / flex 方向）留在本层：间距是三端共同的密度选择，原语里的
 * `gap-2` + `*:w-full` 换过来会在几十个调用点上盲改视觉。
 */
export function FieldShell({
    label,
    required,
    htmlFor,
    error,
    hint,
    className,
    layout = "vertical",
    children,
}: {
    label?: string
    required?: boolean
    htmlFor?: string
    error?: string
    /** 控件下方灰字说明（写作建议、格式要求）；error 存在时优先显示 error */
    hint?: React.ReactNode
    className?: string
    /** vertical = label 在控件上方；horizontal = label 固定左列（w-16） */
    layout?: "vertical" | "horizontal"
    children: React.ReactNode
}) {
    const labelNode = label ? (
        <FieldLabel
            htmlFor={htmlFor}
            className={cn(
                // 必填星号走伪元素 utility（styles.css 的 @utility required-mark）：
                // 不进 label 的文本内容（label 文本保持纯净，供屏幕阅读器与测试查询精确匹配；
                // 必填语义由表单校验/aria 传达）
                required && "required-mark",
                // 左列定宽，顶对齐贴住控件首行
                layout === "horizontal" && "w-16 shrink-0 pt-2.5",
            )}
        >
            {label}
        </FieldLabel>
    ) : undefined

    // error 优先于 hint：同一个位置只讲一件事
    const message = error ? (
        <FieldError>{error}</FieldError>
    ) : hint ? (
        <FieldDescription>{hint}</FieldDescription>
    ) : undefined

    if (layout === "horizontal") {
        return (
            <div className={cn("flex items-start gap-4", className)}>
                {labelNode}
                {/* gap 承担消息行与控件的间距：原语里的 last:mt-0 会盖掉自带的 mt-* */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {children}
                    {message}
                </div>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            {labelNode}
            {children}
            {message}
        </div>
    )
}

// 字段组件（注册到 fieldComponents，自动注入 field context）
type BaseFieldProps = {
    label?: string
    required?: boolean
    className?: string
    /** 透传给 FieldShell 布局：vertical=label 在控件上方（默认），horizontal=label 固定左列 */
    layout?: "vertical" | "horizontal"
    /** 控件下方灰字说明（写作建议、格式要求）；error 存在时优先显示 error */
    hint?: React.ReactNode
}

export function TextField({
    label,
    required,
    layout,
    hint,
    ...props
}: BaseFieldProps &
    Omit<React.ComponentProps<"input">, "value" | "onBlur" | "onChange" | "defaultValue">) {
    const field = useFieldContext<string>()
    const error = firstFieldError(field)
    return (
        <FieldShell
            label={label}
            required={required}
            layout={layout}
            htmlFor={field.name}
            error={error}
            hint={hint}
        >
            <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={Boolean(error)}
                {...props}
            />
        </FieldShell>
    )
}

export function TextareaField({
    label,
    required,
    layout,
    hint,
    ...props
}: BaseFieldProps &
    Omit<React.ComponentProps<"textarea">, "value" | "onBlur" | "onChange" | "defaultValue">) {
    const field = useFieldContext<string>()
    const error = firstFieldError(field)
    return (
        <FieldShell
            label={label}
            required={required}
            layout={layout}
            htmlFor={field.name}
            error={error}
            hint={hint}
        >
            <Textarea
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={Boolean(error)}
                {...props}
            />
        </FieldShell>
    )
}

export function SelectField({
    label,
    required,
    placeholder,
    layout,
    className,
    hint,
    children,
}: BaseFieldProps & {
    placeholder?: string
    children: React.ReactNode
}) {
    const field = useFieldContext<string>()
    const error = firstFieldError(field)
    return (
        <FieldShell
            label={label}
            required={required}
            layout={layout}
            htmlFor={field.name}
            error={error}
            hint={hint}
        >
            <Select
                value={field.state.value}
                onValueChange={(value) => field.handleChange(value ?? "")}
            >
                <SelectTrigger
                    id={field.name}
                    className={cn("w-full", className)}
                    aria-invalid={Boolean(error)}
                >
                    <SelectValue placeholder={placeholder ?? "请选择"} />
                </SelectTrigger>
                <SelectContent>{children}</SelectContent>
            </Select>
        </FieldShell>
    )
}

export function CheckboxField({
    label,
    className,
    hint,
    ...props
}: BaseFieldProps &
    Omit<React.ComponentProps<typeof Checkbox>, "checked" | "onCheckedChange" | "defaultChecked">) {
    const field = useFieldContext<boolean>()
    const error = firstFieldError(field)
    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            <Label className="h-9 cursor-pointer">
                <Checkbox
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                    aria-invalid={Boolean(error)}
                    {...props}
                />
                {label}
            </Label>
            {!error && hint && <FieldDescription>{hint}</FieldDescription>}
            <FieldError>{error}</FieldError>
        </div>
    )
}

// 表单级组件
function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
    const form = useFormContext()
    return (
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
                <Button
                    type="submit"
                    className={className}
                    disabled={!canSubmit || isSubmitting}
                >
                    {isSubmitting ? "提交中…" : children}
                </Button>
            )}
        </form.Subscribe>
    )
}

// 导出
export const { useAppForm, withForm } = createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
        TextField,
        TextareaField,
        SelectField,
        CheckboxField,
    },
    formComponents: {
        SubmitButton,
    },
})
