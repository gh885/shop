import * as React from "react"
import { createFormHook, createFormHookContexts } from "@tanstack/react-form"

import { Button } from "src/components/ui/button"
import { Input } from "src/components/ui/input"
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
 *   `firstFieldError(field)` + `<Field>` 组合即可，不必硬套字段组件
 */

const { fieldContext, formContext, useFormContext, useFieldContext } = createFormHookContexts()

// ---------- 错误归一化（zod issue / string / 其他） ----------

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

// ---------- 布局与错误展示 ----------

export function FieldError({ error, className }: { error?: string; className?: string }) {
    if (!error) return
    return <p className={cn("text-xs text-destructive", className)}>{error}</p>
}

/**
 * 字段布局壳：label（必填红星）+ 控件 + 行内错误。
 * 字段组件默认用它渲染；自定义 render-prop 场景也可单独复用。
 */
export function Field({
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
        <label
            htmlFor={htmlFor}
            className={cn(
                layout === "horizontal"
                    ? "w-16 shrink-0 pt-2.5 text-sm"
                    : "text-sm font-medium text-foreground",
                // 必填星号走伪元素：不进 label 的文本内容（label 文本保持纯净，供
                // 屏幕阅读器与测试查询精确匹配；必填语义由表单校验/aria 传达）
                required && "before:mr-0.5 before:text-destructive before:content-['*']",
            )}
        >
            {label}
        </label>
    ) : undefined

    if (layout === "horizontal") {
        return (
            <div className={cn("flex items-start gap-4", className)}>
                {labelNode}
                <div className="min-w-0 flex-1">
                    {children}
                    {error ? (
                        <FieldError
                            error={error}
                            className="mt-1.5"
                        />
                    ) : hint ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
                    ) : undefined}
                </div>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            {labelNode}
            {children}
            {error ? (
                <FieldError error={error} />
            ) : hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : undefined}
        </div>
    )
}

// ---------- 字段组件（注册到 fieldComponents，自动注入 field context） ----------

type BaseFieldProps = {
    label?: string
    required?: boolean
    className?: string
    /** 透传给 Field 布局：vertical=label 在控件上方（默认），horizontal=label 固定左列 */
    layout?: "vertical" | "horizontal"
}

export function TextField({
    label,
    required,
    layout,
    ...props
}: BaseFieldProps &
    Omit<React.ComponentProps<"input">, "value" | "onBlur" | "onChange" | "defaultValue">) {
    const field = useFieldContext<string>()
    const error = firstFieldError(field)
    return (
        <Field
            label={label}
            required={required}
            layout={layout}
            htmlFor={field.name}
            error={error}
        >
            <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={Boolean(error)}
                {...props}
            />
        </Field>
    )
}

export function TextareaField({
    label,
    required,
    layout,
    ...props
}: BaseFieldProps &
    Omit<React.ComponentProps<"textarea">, "value" | "onBlur" | "onChange" | "defaultValue">) {
    const field = useFieldContext<string>()
    const error = firstFieldError(field)
    return (
        <Field
            label={label}
            required={required}
            layout={layout}
            htmlFor={field.name}
            error={error}
        >
            <Textarea
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={Boolean(error)}
                {...props}
            />
        </Field>
    )
}

export function SelectField({
    label,
    required,
    placeholder,
    layout,
    className,
    children,
}: BaseFieldProps & {
    placeholder?: string
    children: React.ReactNode
}) {
    const field = useFieldContext<string>()
    const error = firstFieldError(field)
    return (
        <Field
            label={label}
            required={required}
            layout={layout}
            htmlFor={field.name}
            error={error}
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
        </Field>
    )
}

export function CheckboxField({
    label,
    className,
    ...props
}: BaseFieldProps &
    Omit<React.ComponentProps<typeof Checkbox>, "checked" | "onCheckedChange" | "defaultChecked">) {
    const field = useFieldContext<boolean>()
    const error = firstFieldError(field)
    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                    checked={Boolean(field.state.value)}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                    aria-invalid={Boolean(error)}
                    {...props}
                />
                {label}
            </label>
            <FieldError error={error} />
        </div>
    )
}

// ---------- 表单级组件 ----------

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

// ---------- 导出 ----------

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
