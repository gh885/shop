import * as React from "react"
import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import { startOfToday } from "date-fns"
import { enUS } from "date-fns/locale/en-US"
import { zhCN } from "date-fns/locale/zh-CN"
import { CalendarIcon, CircleAlert } from "lucide-react"

import { Button } from "src/components/ui/button"
import { Calendar } from "src/components/ui/calendar"
import { Input } from "src/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "src/components/ui/popover"
import { Field, FieldDescription, FieldError, FieldLabel } from "src/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "src/components/ui/input-group"
import { Item, ItemContent, ItemDescription, ItemTitle } from "src/components/ui/item"
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group"
import { Textarea } from "src/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "src/components/ui/select"
import { Checkbox } from "src/components/ui/checkbox"
import { cn } from "src/lib/utils"

import {
    composeWallClock,
    formatWallClockDisplay,
    formatWallClockTime,
    parseWallClock,
    type WallClockLocale,
} from "./wall-clock"
import { useUiLabels } from "./ui-labels"

/**
 * 表单基础设施（TanStack Form 官方 createFormHook + fieldComponents）。字段组件封装了 value/onChange/onBlur 接线、label、必填红星、行内错误；布局全由 ui/field 的 `Field` 承担。
 * 字段级那一句（422 的 `errors[]`）走 `applyServerFieldErrors(form, texts)`（texts 由 app-kit 的 `serverFieldErrors` 按白名单映射，见 `server-field-errors.ts`）；服务端/表单级错误用 `<FormError>`。
 */

const { fieldContext, formContext, useFieldContext } = createFormHookContexts()

/** 可聚焦（登录提交失败后移焦点过来）但不画焦点环：非交互控件，播报已由 role="alert" 完成 */
export function FormError({ className, children, ...props }: React.ComponentProps<"p">) {
    if (!children) return
    return (
        <p
            role="alert"
            className={cn(
                "flex items-center gap-1.5 text-2xs text-destructive outline-none",
                className,
            )}
            {...props}
        >
            <CircleAlert className="size-3.5 shrink-0" />
            {children}
        </p>
    )
}

type FieldProps = {
    label?: string
    required?: boolean
    className?: string
    /** 默认 vertical（label 在控件上方）；horizontal = label 固定左列 */
    orientation?: "vertical" | "horizontal"
    /** error 存在时优先显示 error，不显示 hint */
    hint?: React.ReactNode
}

type FieldState = { state: { meta: { errors: ReadonlyArray<unknown>; isValid: boolean } } }

const errorId = (id: string) => `${id}-error`
const hintId = (id: string) => `${id}-hint`
const labelId = (id: string) => `${id}-label`

/** aria-describedby 只指真实渲染的节点：FieldError 无效但零错误时返回 null，此时不留指向空气的引用 */
function describedBy(
    id: string | undefined,
    field: FieldState,
    hint: React.ReactNode,
): string | undefined {
    if (!id) return undefined
    const { isValid, errors } = field.state.meta
    if (!isValid) return errors.length > 0 ? errorId(id) : undefined
    return hint ? hintId(id) : undefined
}

/** 共用组装：Field + label + 控件 + 错误(优先)/说明。id/errorId/hintId 命名约定集中在此一处，控件侧不拼字符串（配合 describedBy） */
function FieldFrame({
    field,
    id,
    label,
    required,
    hint,
    orientation,
    className,
    children,
}: FieldProps & { field: FieldState; id?: string; children: React.ReactNode }) {
    return (
        <Field
            orientation={orientation}
            className={className}
        >
            {label && (
                <FieldLabel
                    htmlFor={id}
                    id={id && labelId(id)}
                    required={required}
                >
                    {label}
                </FieldLabel>
            )}
            {children}
            {field.state.meta.isValid ? (
                hint && <FieldDescription id={id && hintId(id)}>{hint}</FieldDescription>
            ) : (
                <FieldError
                    id={id && errorId(id)}
                    errors={field.state.meta.errors}
                />
            )}
        </Field>
    )
}

function TextField({
    label,
    required,
    orientation,
    hint,
    className,
    counter,
    trailing,
    ...props
}: FieldProps & {
    /** 右侧显示 已输入/maxLength 计数；需同时传 maxLength 才有分母 */
    counter?: boolean
    /** 只负责定位，不替输入框预留右侧空间（由调用点 CSS 决定） */
    trailing?: React.ReactNode
} & Omit<React.ComponentProps<"input">, "value" | "onBlur" | "onChange" | "defaultValue">) {
    const field = useFieldContext<string>()
    // id 用 useId 而非 field.name：后者只表单内唯一，同页多表单会撞
    const id = React.useId()
    const control = {
        id,
        value: field.state.value,
        onBlur: field.handleBlur,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value),
        "aria-invalid": !field.state.meta.isValid,
        "aria-describedby": describedBy(id, field, hint),
        ...props,
    }
    const input = counter ? (
        <InputGroup>
            <InputGroupInput {...control} />
            <InputGroupAddon
                align="inline-end"
                variant="counter"
                className="tabular-nums"
            >
                {field.state.value.length}/{props.maxLength}
            </InputGroupAddon>
        </InputGroup>
    ) : (
        <Input {...control} />
    )
    return (
        <FieldFrame
            field={field}
            id={id}
            label={label}
            required={required}
            orientation={orientation}
            hint={hint}
            className={className}
        >
            {trailing ? (
                <div className="relative">
                    {input}
                    <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
                </div>
            ) : (
                input
            )}
        </FieldFrame>
    )
}

function TextareaField({
    label,
    required,
    orientation,
    hint,
    className,
    ...props
}: FieldProps &
    Omit<React.ComponentProps<"textarea">, "value" | "onBlur" | "onChange" | "defaultValue">) {
    const field = useFieldContext<string>()
    const id = React.useId()
    return (
        <FieldFrame
            field={field}
            id={id}
            label={label}
            required={required}
            orientation={orientation}
            hint={hint}
            className={className}
        >
            <Textarea
                id={id}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={describedBy(id, field, hint)}
                {...props}
            />
        </FieldFrame>
    )
}

/**
 * 日期时间：日历挑日 + 时分输入，替掉裸 `type="datetime-local"`。值仍是 `WALL_CLOCK` 字符串。
 * 可见文案在渲染期从 `UiLabels` 按当前语言取；日历 locale 另由 `locale` prop 定（周起始/月名是格式化关注点，非 ui-web 内嵌的自然语言）。
 */
function DateTimeField({
    label,
    required,
    orientation,
    hint,
    className,
    placeholder,
    locale,
}: FieldProps & { placeholder?: string; locale?: WallClockLocale }) {
    const field = useFieldContext<string>()
    const resolvedLocale = locale ?? "zh-Hans-CN"
    const dateLocale = resolvedLocale === "en-US" ? enUS : zhCN
    const dateTimeLabels = useUiLabels().dateTimePicker
    const resolvedPlaceholder = placeholder ?? dateTimeLabels.placeholder
    const clearText = dateTimeLabels.clear
    const doneText = dateTimeLabels.done
    const timeLabel = dateTimeLabels.timeAria(label ?? "")
    const id = React.useId()
    const [open, setOpen] = React.useState(false)
    const selected = parseWallClock(field.state.value)
    // react-day-picker 受控月不跟 selected 走，手动对齐否则打开停在当月而非已存的那个月
    const [month, setMonth] = React.useState<Date>(() => selected ?? startOfToday())

    /** 合起来才写回；拼装规则（秒位清零、时分管不住时的兜底）在 wall-clock.ts */
    const commit = (date: Date, time: string) => {
        field.handleChange(composeWallClock(date, time))
    }
    const timeValue = selected ? formatWallClockTime(selected) : ""

    return (
        <FieldFrame
            field={field}
            id={id}
            label={label}
            required={required}
            orientation={orientation}
            hint={hint}
            className={className}
        >
            <Popover
                open={open}
                onOpenChange={(next) => {
                    if (next && selected) setMonth(selected)
                    setOpen(next)
                }}
            >
                <PopoverTrigger
                    render={
                        <Button
                            id={id}
                            type="button"
                            variant="outline"
                            aria-invalid={!field.state.meta.isValid}
                            aria-describedby={describedBy(id, field, hint)}
                            className="w-full justify-between font-normal"
                        />
                    }
                >
                    <span
                        className={cn(
                            "truncate tabular-nums",
                            !selected && "text-muted-foreground",
                        )}
                    >
                        {selected
                            ? formatWallClockDisplay(selected, resolvedLocale)
                            : resolvedPlaceholder}
                    </span>
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    className="w-auto gap-3"
                >
                    <Calendar
                        locale={dateLocale}
                        mode="single"
                        month={month}
                        onMonthChange={setMonth}
                        onSelect={(day) => day && commit(day, timeValue || "00:00")}
                        selected={selected}
                    />
                    <div className="flex items-center gap-2">
                        <Input
                            aria-label={timeLabel}
                            className="flex-1"
                            onBlur={field.handleBlur}
                            onChange={(e) => commit(selected ?? startOfToday(), e.target.value)}
                            step={60}
                            type="time"
                            value={timeValue}
                        />
                        <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                field.handleChange("")
                                setOpen(false)
                            }}
                        >
                            {clearText}
                        </Button>
                        <Button
                            size="sm"
                            type="button"
                            onClick={() => setOpen(false)}
                        >
                            {doneText}
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </FieldFrame>
    )
}

type Option = { value: string; label: string }

/** 下拉：选项走 items（Base UI 靠它把选中值解析成展示文案），空串 = 未选、显示占位 */
function SelectField({
    label,
    required,
    orientation,
    hint,
    className,
    placeholder,
    items,
}: FieldProps & { placeholder?: string; items: ReadonlyArray<Option> }) {
    const field = useFieldContext<string>()
    const resolvedPlaceholder = placeholder ?? useUiLabels().select.placeholder
    const id = React.useId()
    return (
        <FieldFrame
            field={field}
            id={id}
            label={label}
            required={required}
            orientation={orientation}
            hint={hint}
            className={className}
        >
            <Select
                items={items}
                value={field.state.value}
                onValueChange={(value) => field.handleChange(value ?? "")}
            >
                <SelectTrigger
                    id={id}
                    className="w-full"
                    aria-invalid={!field.state.meta.isValid}
                    aria-describedby={describedBy(id, field, hint)}
                >
                    <SelectValue placeholder={resolvedPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                    {items.map((item) => (
                        <SelectItem
                            key={item.value}
                            value={item.value}
                        >
                            {item.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </FieldFrame>
    )
}

function CheckboxField({
    label,
    hint,
    orientation,
    className,
    ...props
}: FieldProps &
    Omit<React.ComponentProps<typeof Checkbox>, "checked" | "onCheckedChange" | "defaultChecked">) {
    const field = useFieldContext<boolean>()
    const id = React.useId()
    return (
        <FieldFrame
            field={field}
            id={id}
            hint={hint}
            orientation={orientation}
            className={className}
        >
            <FieldLabel>
                <Checkbox
                    id={id}
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                    aria-invalid={!field.state.meta.isValid}
                    aria-describedby={describedBy(id, field, hint)}
                    {...props}
                />
                {label}
            </FieldLabel>
        </FieldFrame>
    )
}

/** 单选：label-in-name——可访问名与可见标题同词 */
function RadioGroupField({
    label,
    required,
    orientation,
    hint,
    className,
    options,
}: FieldProps & { options: ReadonlyArray<Option & { description?: string }> }) {
    const field = useFieldContext<string>()
    const id = React.useId()
    return (
        <FieldFrame
            field={field}
            id={id}
            label={label}
            required={required}
            orientation={orientation}
            hint={hint}
            className={className}
        >
            <RadioGroup
                id={id}
                aria-labelledby={labelId(id)}
                aria-invalid={!field.state.meta.isValid}
                aria-describedby={describedBy(id, field, hint)}
                value={field.state.value}
                onValueChange={(value: string) => field.handleChange(value)}
            >
                {options.map((option) => (
                    <Item
                        key={option.value}
                        variant={field.state.value === option.value ? "selected" : "selectable"}
                        size="sm"
                    >
                        <RadioGroupItem
                            value={option.value}
                            aria-label={option.label}
                        />
                        <ItemContent>
                            <ItemTitle>{option.label}</ItemTitle>
                            {option.description && (
                                <ItemDescription lines={1}>{option.description}</ItemDescription>
                            )}
                        </ItemContent>
                    </Item>
                ))}
            </RadioGroup>
        </FieldFrame>
    )
}

export const { useAppForm } = createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
        TextField,
        TextareaField,
        SelectField,
        CheckboxField,
        RadioGroupField,
        DateTimeField,
    },
    formComponents: {},
})
