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

/**
 * 账号侧表单的三个字段级积木：一行文本输入、口令输入、提交按钮。
 *
 * 为什么值得单独成一层：登录框、子账号登录/激活、店主开的子账号表单，画的都是同一种「字段行」——
 * `Field` 包住控件与 `FieldError`，口令再多一个小眼睛，提交按钮再带上它自己的 Spinner。
 * 这些形状此前在 `login-form` 与 seller 的两处表单里各写了一遍（fallow audit 报出 4 组克隆），
 * 而它们**本来就没有端差异**：差异只在「这一格收什么、叫什么」，那是 props 的事。
 *
 * `field` 只用到四个成员，所以按结构化类型声明：app-kit 不直接 import `@tanstack/react-form`
 * （它只是 ui-web 的传递依赖，直接引用会成为幽灵依赖）。
 */
export interface TextFieldApi {
    state: {
        value: string
        meta: { errors: ReadonlyArray<unknown>; isValid: boolean }
    }
    handleBlur: () => void
    handleChange: (value: string) => void
}

/** 输入过滤：`digits` = 只留数字（手机号/短信码），`upper` = 转大写（图形码）。其余原样透传 */
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
    /**
     * 皮肤：`filled` = 登录/激活那种灰底大档（h-11、无描边，聚焦翻白）；
     * `outline` = 表单页的常规描边输入框。两者共享**同一套**校验与错误渲染，只换控件。
     */
    skin?: "outline" | "filled"
    /** 一次性码：字符拉开字距、等宽数字，便于逐位对读 */
    code?: boolean
    /** 行尾插槽（小眼睛 / 发码按钮 / 验证码图）：原样作为输入组的最后一个子元素 */
    trailing?: ReactNode
}

/**
 * 输入过滤：纯函数，放在组件外 —— 「这一格收什么字符」与渲染无关，
 * 留在组件的 onChange 里只会给那个闭包多两条分支。
 */
function applyFilter(value: string, filter: InputFilter | undefined): string {
    if (filter === "digits") return value.replaceAll(/\D/g, "")
    if (filter === "upper") return value.toUpperCase()
    return value
}

/** 两档皮肤的参数（查表而不是在 JSX 里写三元）：`filled` 换大档与填充底色，控件仍是同一个输入组 */
const SKIN_VARIANTS = {
    outline: { size: "default", variant: "default" },
    filled: { size: "lg", variant: "filled" },
} as const

/**
 * 一行文本输入：`Field` + 控件 + `FieldError`。
 *
 * 两种皮肤共用 `InputGroup` 一个控件（`filled` 只是换大档与填充底色）：描边皮肤用裸 `Input`
 * 在视觉上等价，但两条渲染路径会让「校验、错误、行尾插槽」各写一遍。
 *
 * `invalid` 与 `errors` 都从 `field.state.meta` 取，调用点不再各写一遍 `!field.state.meta.isValid`——
 * 那是「同一个判据抄两处」，抄漏一处的表现就是标红与 aria 说法不一致。
 *
 * 可访问名由调用点二选一给：`ariaLabel`（filled 皮肤，屏幕上没有标签）或 `label`（描边皮肤，
 * 它同时是 `<label for>` 的文本）。不在这里做「没给 ariaLabel 就退回 label」——那会让同一句话
 * 既当可见标签又当 aria-label，读屏会念两遍（`aria-label` 会盖掉 label 关联）。
 *
 * 一次性码的字距写成行内三元而不是查表：`shadcn/require-static-classes` 要求类名能静态读出来，
 * `TABLE[key]` 那种取值会被判成「动态拼类名」。
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

/**
 * 口令字段：就是 `filled` 皮肤的一行文本输入 + 尾端小眼睛。
 * 显隐状态属于组件自己的瞬时态（`usePasswordVisibility` 是对外唯一出口），调用点不持它。
 */
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
    /** `cta` = 登录/激活那种通栏主按钮（h-11 满宽）；`default` = 表单页里的常规主按钮 */
    variant?: "cta" | "default"
    className?: string
}

/**
 * 提交按钮。**不含** `form.Subscribe`：拿到「在不在提交」的方式各表单不同（登录框读 form，
 * 弹窗读 mutation 的 isPending），所以这一格由调用点给；这里只管按钮自己长什么样。
 */
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
