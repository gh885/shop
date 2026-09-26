import * as React from "react"
import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import { format, isValid, parseISO, startOfToday } from "date-fns"
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

/**
 * 表单基础设施（基于 TanStack Form 官方 createFormHook + fieldComponents 模式）
 *
 * 设计目标：把「render-prop 样板 + label/错误/控件接线」一步步吞进字段组件，
 * 业务侧只剩声明式 JSX：
 *
 * ```tsx
 * const form = useAppForm({ defaultValues: {...}, validators: { onSubmit: Schema }, onSubmit: ... });
 *
 * <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}>
 *     <form.AppField name="receiver">
 *         {(field) => <field.TextField label="收货人姓名" required placeholder="请输入" />}
 *     </form.AppField>
 *     <form.AppField name="targetType">
 *         {(field) => <field.SelectField label="跳转类型" items={[{ value: "NONE", label: "不跳转" }]} />}
 *     </form.AppField>
 *     <form.AppField name="isDefault">
 *         {(field) => <field.CheckboxField label="设置为默认收货地址" />}
 *     </form.AppField>
 *     <Button type="submit">保存</Button>
 * </form>
 * ```
 *
 * 约定：
 * - 校验统一放在表单级 `validators: { onSubmit: ZodSchema }`，错误文案取自 Zod message
 * - 字段组件封装了 value / onChange / onBlur 接线、label、必填红星、行内错误；布局全部由 ui/field 的
 *   `Field` 承担（这里不再另起容器）
 * - 高度定制化的字段（登录页 `+86` 前缀、内嵌按钮等）退回裸 `form.AppField` render-prop，
 *   直接用 `<Field>` + `<FieldError errors={field.state.meta.errors} />` 组合即可，不必硬套字段组件
 * - 服务端/表单级错误用 `<FormError>` 渲染，不各自写红字
 */

const { fieldContext, formContext, useFieldContext } = createFormHookContexts()

/** 服务端错误 / 表单级校验错误：一行带图标的红字，`role="alert"` 播报。空内容不渲染。
    可聚焦（登录表单提交失败后把焦点移过来），焦点环不画：它不是交互控件，播报已由 role 完成 */
export function FormError({ className, children, ...props }: React.ComponentProps<"p">) {
    if (!children) return
    return (
        <p
            role="alert"
            className={cn(
                "flex items-center gap-1.5 text-xs text-destructive outline-none",
                className,
            )}
            {...props}
        >
            <CircleAlert className="size-3.5 shrink-0" />
            {children}
        </p>
    )
}

// 字段组件（注册到 fieldComponents，自动注入 field context）
type FieldProps = {
    label?: string
    required?: boolean
    className?: string
    /** vertical=label 在控件上方（默认），horizontal=label 固定左列 */
    orientation?: "vertical" | "horizontal"
    /** 控件下方灰字说明（写作建议、格式要求）；error 存在时优先显示 error */
    hint?: React.ReactNode
}

type FieldState = { state: { meta: { errors: ReadonlyArray<unknown>; isValid: boolean } } }

/** 字段组件共用的组装：Field 容器 + label + 控件 + 错误（优先）/说明。error 优先于 hint：同一个位置只讲一件事 */
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
                    required={required}
                >
                    {label}
                </FieldLabel>
            )}
            {children}
            {field.state.meta.isValid ? (
                hint && <FieldDescription>{hint}</FieldDescription>
            ) : (
                <FieldError errors={field.state.meta.errors} />
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
    ...props
}: FieldProps & {
    /** 右侧显示 `已输入/maxLength` 字数计数（需同时传 maxLength） */
    counter?: boolean
} & Omit<React.ComponentProps<"input">, "value" | "onBlur" | "onChange" | "defaultValue">) {
    const field = useFieldContext<string>()
    // label↔控件关联 id 必须页内唯一：field.name 只保证表单内唯一，同页两个表单会撞 id
    const id = React.useId()
    const control = {
        id,
        value: field.state.value,
        onBlur: field.handleBlur,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value),
        "aria-invalid": !field.state.meta.isValid,
        ...props,
    }
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
            {counter ? (
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
                {...props}
            />
        </FieldFrame>
    )
}

/** 墙上时钟形状，与 `datetime-local` 的输入值同形（不带时区偏移）：
    读写都按本地时区解释，两侧对称——CMS 上下线时间曾因回填走 UTC 而每保存一次前挪 8 小时 */
const WALL_CLOCK = "yyyy-MM-dd'T'HH:mm"

function parseWallClock(value: string): Date | undefined {
    if (!value) return undefined
    const parsed = parseISO(value)
    return isValid(parsed) ? parsed : undefined
}

/**
 * 日期时间：日历挑日 + 时分输入。替掉裸 `type="datetime-local"` 是为了三件原生控件给不了的事：
 * 跨浏览器同一张脸（原生那个在 Chrome/Safari/Firefox 是三种控件）、周起始与文案固定中文、
 * 以及「留空」这个真实业务态（定时上线留空 = 立即生效）有一个明确的清除入口。
 * 值仍是 `WALL_CLOCK` 字符串，所以契约转换与既有测试给的确定值都不用改形状。
 */
function DateTimeField({
    label,
    required,
    orientation,
    hint,
    className,
    placeholder = "选择日期时间",
}: FieldProps & { placeholder?: string }) {
    const field = useFieldContext<string>()
    const id = React.useId()
    const [open, setOpen] = React.useState(false)
    const selected = parseWallClock(field.state.value)
    // 翻月位置自己拿：react-day-picker 的受控月不会跟着 selected 走，不补这一步的话
    // 编辑既有记录时打开日历看到的是本月，而不是已存下的那个月
    const [month, setMonth] = React.useState<Date>(() => selected ?? startOfToday())

    /** 日期与时分各改各的，合起来才写回：只选日不选时不会把时间悄悄归到 00:00 */
    const commit = (date: Date, time: string) => {
        const [hour, minute] = time.split(":")
        const next = new Date(date)
        next.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0)
        field.handleChange(format(next, WALL_CLOCK))
    }
    const timeValue = selected ? format(selected, "HH:mm") : ""

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
                        {selected ? format(selected, "yyyy-MM-dd HH:mm") : placeholder}
                    </span>
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    className="w-auto gap-3"
                >
                    <Calendar
                        locale={zhCN}
                        mode="single"
                        month={month}
                        onMonthChange={setMonth}
                        onSelect={(day) => day && commit(day, timeValue || "00:00")}
                        selected={selected}
                    />
                    <div className="flex items-center gap-2">
                        <Input
                            aria-label={`${label ?? "该字段"}的时分`}
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
                            清除
                        </Button>
                        <Button
                            size="sm"
                            type="button"
                            onClick={() => setOpen(false)}
                        >
                            完成
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </FieldFrame>
    )
}

type Option = { value: string; label: string }

/** 下拉：选项走 `items`（Base UI 用它把选中值解析成展示文案），空串 = 未选、显示占位 */
function SelectField({
    label,
    required,
    orientation,
    hint,
    className,
    placeholder = "请选择",
    items,
}: FieldProps & { placeholder?: string; items: ReadonlyArray<Option> }) {
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
            <Select
                items={items}
                value={field.state.value}
                onValueChange={(value) => field.handleChange(value ?? "")}
            >
                <SelectTrigger
                    id={id}
                    className="w-full"
                    aria-invalid={!field.state.meta.isValid}
                >
                    <SelectValue placeholder={placeholder} />
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
    return (
        <FieldFrame
            field={field}
            hint={hint}
            orientation={orientation}
            className={className}
        >
            <FieldLabel>
                <Checkbox
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                    aria-invalid={!field.state.meta.isValid}
                    {...props}
                />
                {label}
            </FieldLabel>
        </FieldFrame>
    )
}

/** 单选：每个选项一张可选卡（Item selected/selectable），可访问名与可见标题同词（label-in-name） */
function RadioGroupField({
    label,
    required,
    orientation,
    hint,
    className,
    options,
}: FieldProps & { options: ReadonlyArray<Option & { description?: string }> }) {
    const field = useFieldContext<string>()
    return (
        <FieldFrame
            field={field}
            label={label}
            required={required}
            orientation={orientation}
            hint={hint}
            className={className}
        >
            <RadioGroup
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

// 导出
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
