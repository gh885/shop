"use client"

import { isValidPhoneNumber } from "react-phone-number-input/min"

/** 刻意具名：写成裸 maxLength={11} 无人知它对应哪条规则，位数一改就静默漂成无主字面量（FieldRuleVocabularyTest「app 里不许有裸的字数上限」当场红）。与 app-kit 的 PHONE_DIGITS 同档，登记在那条策略上 */
const MAINLAND_MOBILE_DIGITS = 11

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group"
import { useUiLabels } from "./ui-labels"

/**
 * PhoneField —— 国内手机号输入（固定 +86、只收 11 位裸号，与其余登录字段同款 filled InputGroup + 静态前缀，不用国旗/国家下拉；契约只收裸 11 位 /^1[3-9]\d{9}$/）。
 * 校验不自己写正则，用 react-phone-number-input 的号码元数据实时判有效性（min 构建，无 UI 依赖、不引整包），规则变了不必跟改；输入值本身仍只存裸 11 位。不用 reui PhoneInput——那是国际 E.164 + 国家下拉的 outline 皮肤，与本形态不合（见 reui/README）。
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
    placeholder?: string
    className?: string
    autoComplete?: string
}) {
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
                // 两种「红」取或（不能用 ??：否则调用方传 false 会吃掉本字段判定、填满的非法号永不报）。本字段只在「填满但非法」时标红，未填满不算错（否则每敲一位都报错）
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
