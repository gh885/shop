import type { ReactNode } from "react"

import {
    Button,
    Field,
    FieldError,
    FieldLabel,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    PasswordToggle,
    Spinner,
} from "@shop/ui-web"

import { usePasswordVisibility } from "./use-password-visibility"

/** `field` 按结构化类型声明：app-kit 不 import `@tanstack/react-form`（ui-web 的传递依赖，直接引用会成幽灵依赖） */
export interface TextFieldApi {
    state: {
        value: string
        meta: { errors: ReadonlyArray<unknown>; isValid: boolean }
    }
    handleBlur: () => void
    handleChange: (value: string) => void
}

type InputFilter = "digits" | "upper"

export interface TextFieldProps {
    field: TextFieldApi
    id: string
    /** 可见标签：给了就画在控件上方（描边皮肤必给，登录大档一般不给） */
    label?: string
    /** 没有可见标签时的可访问名（登录大档走这一格） */
    ariaLabel?: string
    placeholder?: string
    type?: string
    autoComplete?: string
    inputMode?: "text" | "tel" | "numeric" | "email"
    maxLength?: number
    readOnly?: boolean
    filter?: InputFilter
    /** 皮肤：`filled`（灰底大档）/ `outline`（描边），两者共享同一套校验与错误渲染，只换控件 */
    skin?: "outline" | "filled"
    /** 一次性码：字符拉开字距、等宽数字，便于逐位对读 */
    code?: boolean
    /** 行尾插槽（小眼睛 / 发码按钮 / 验证码图） */
    trailing?: ReactNode
}

function applyFilter(value: string, filter: InputFilter | undefined): string {
    if (filter === "digits") return value.replaceAll(/\D/g, "")
    if (filter === "upper") return value.toUpperCase()
    return value
}

const SKIN_VARIANTS = {
    outline: { size: "default", variant: "default" },
    filled: { size: "lg", variant: "filled" },
} as const

/**
 * 可访问名由调用点二选一给（`ariaLabel` 或 `label`），不做「没给 ariaLabel 就退回 label」：两者共存读屏会念两遍。
 * 一次性码字距用行内三元而非查表——`shadcn/require-static-classes` 读不到 `TABLE[key]` 的动态类名。
 */
export function TextField({
    field,
    id,
    label,
    ariaLabel,
    placeholder,
    type,
    autoComplete,
    inputMode,
    maxLength,
    readOnly,
    filter,
    skin = "outline",
    code = false,
    trailing,
}: TextFieldProps) {
    const invalid = !field.state.meta.isValid
    const group = SKIN_VARIANTS[skin]
    const inputVariant = code ? "code" : "default"

    return (
        <Field>
            {label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : undefined}
            <InputGroup
                size={group.size}
                variant={group.variant}
                invalid={invalid}
            >
                <InputGroupInput
                    id={id}
                    aria-label={ariaLabel}
                    aria-invalid={invalid}
                    variant={inputVariant}
                    className={code ? "tabular-nums" : undefined}
                    placeholder={placeholder}
                    type={type}
                    autoComplete={autoComplete}
                    inputMode={inputMode}
                    maxLength={maxLength}
                    readOnly={readOnly}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                        field.handleChange(applyFilter(event.target.value, filter))
                    }
                />
                {trailing}
            </InputGroup>
            <FieldError errors={field.state.meta.errors} />
        </Field>
    )
}

/** 口令字段：`filled` 皮肤 + 尾端小眼睛；显隐是组件内部瞬时态，调用点不持它 */
export function PasswordField({
    field,
    id,
    label,
    placeholder,
    autoComplete = "current-password",
}: {
    field: TextFieldApi
    id: string
    label: string
    placeholder?: string
    autoComplete?: string
}) {
    const password = usePasswordVisibility()
    return (
        <TextField
            field={field}
            id={id}
            ariaLabel={label}
            skin="filled"
            type={password.inputType}
            placeholder={placeholder}
            autoComplete={autoComplete}
            trailing={
                <InputGroupAddon align="inline-end">
                    <PasswordToggle {...password.toggleProps} />
                </InputGroupAddon>
            }
        />
    )
}

export interface SubmitButtonProps {
    /** 提交中：禁用并显示 Spinner（禁用是必须的，连点会重复提交） */
    pending: boolean
    label: string
    /** `cta` = 登录/激活的通栏主按钮（h-11 满宽）；`default` = 表单页常规主按钮 */
    variant?: "cta" | "default"
    className?: string
}

/** 提交按钮。不内聚 form.Subscribe——「在不在提交」各表单来源不同，pending 由调用点传入 */
export function SubmitButton({ pending, label, variant = "cta", className }: SubmitButtonProps) {
    return (
        <Button
            type="submit"
            variant={variant}
            className={className ?? (variant === "cta" ? "h-11 w-full" : undefined)}
            disabled={pending}
        >
            {pending && <Spinner />}
            {label}
        </Button>
    )
}
