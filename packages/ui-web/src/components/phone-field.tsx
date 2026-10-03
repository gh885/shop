"use client"

import { isValidPhoneNumber } from "react-phone-number-input/min"

/**
 * 输入框可敲的位数上限：这个字段固定 +86 前缀，只收号码本体（11 位大陆手机号）。
 *
 * 刻意具名：写成 `maxLength={11}` 时没人知道它对应哪条规则，而位数一改这里就会静默漂成一个无主的字面量
 * （FieldRuleVocabularyTest 的「app 里不许有裸的字数上限」会当场红）。位数与 `packages/app-kit` 的
 * `PHONE_DIGITS`（登录手机号）同档，登记在那条策略上。
 */
const MAINLAND_MOBILE_DIGITS = 11

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group"
import { useUiLabels } from "./ui-labels"

/**
 * PhoneField —— 国内手机号输入（固定 +86、只收 11 位裸号）
 *
 * 形态与项目的其余登录字段一致：InputGroup 的 filled 变体 + 静态 "+86" 前缀，不用国旗、
 * 不用国家下拉——本项目手机号契约只收**裸 11 位**（/^1[3-9]\d{9}$/，后端 @Pattern 写进
 * OpenAPI），单国家场景下国家选择器是多余的一层交互。
 *
 * 但校验不自己写正则：用 react-phone-number-input 的号码元数据做实时有效性判断
 * （min 构建，无 UI 依赖、不引整包），号码规则变了不必跟着改。输入值本身仍只存裸 11 位。
 *
 * 为什么不用 reui 的 PhoneInput：那个组件是给「国际 E.164 + 国家下拉」设计的，自带
 * outline 皮肤的国旗触发器，与本项目 filled 登录表单和固定 +86 的形态都不合（见 reui/README）。
 * 它的价值（号码元数据）被这里以「只用 min 校验」的方式吸收。
 */
export function PhoneField({
    value,
    onChange,
    onBlur,
    invalid,
    size = "lg",
    id,
    "aria-label": ariaLabel,
    placeholder,
    className,
    autoComplete = "tel",
}: {
    /** 裸 11 位（不含国家码）；空串 = 未填 */
    value: string
    onChange: (value: string) => void
    onBlur?: () => void
    invalid?: boolean
    size?: "default" | "lg"
    id?: string
    "aria-label"?: string
    /** 占位文案；不传则取当前语言的通用文案 */
    placeholder?: string
    className?: string
    autoComplete?: string
}) {
    // aria-label 与 placeholder 在渲染期从 context 取（调用点也可显式传同名 prop 覆盖）
    const labels = useUiLabels().phoneField
    const resolvedAriaLabel = ariaLabel ?? labels.ariaLabel
    const resolvedPlaceholder = placeholder ?? labels.placeholder
    // 11 位齐了才谈有效：位数不够时 isValidPhoneNumber 恒 false，会让半截号码一直显红。
    const complete = value.length === 11
    const valid = complete && isValidPhoneNumber(`+86${value}`, "CN")

    return (
        <InputGroup
            size={size}
            variant="filled"
            className={className}
        >
            <InputGroupAddon align="inline-start">
                <InputGroupText className="tabular-nums">+86</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
                id={id}
                aria-label={resolvedAriaLabel}
                // 两种「红」取或：表单级 invalid（schema 报错）与本字段的实时号码校验。
                // 不能用 `??` 让调用方的 false 掉本字段的判定——那样填满的非法号码就永远不报。
                // 只在「填满但号码非法」时由本字段标红；未填满不算错（否则每敲一位都在报错）。
                aria-invalid={invalid === true || (complete && !valid)}
                className="tabular-nums"
                placeholder={resolvedPlaceholder}
                inputMode="tel"
                autoComplete={autoComplete}
                maxLength={MAINLAND_MOBILE_DIGITS}
                value={value}
                onBlur={onBlur}
                onChange={(e) => onChange(e.target.value.replaceAll(/\D/g, ""))}
            />
        </InputGroup>
    )
}
