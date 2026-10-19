import { ADDRESS_LABELS, type BuiltinLabelKey } from "./constants"

/** 本域展示函数的出口：标签 code → i18n key 或原样文本。纯数据表在 constants.ts，判定在 rules.ts */

/** 标签展示解析的结果：内置标签回其 i18n key（渲染处 `t()` 解析），自定义标签回原样用户文本（不翻译）。 */
export type LabelDisplay = { kind: "key"; key: BuiltinLabelKey } | { kind: "text"; text: string }

/** 标签展示解析：内置标签查表回 key，自定义标签按原样文本读回（用户自己写的那句），未选给 undefined */
export function labelName(label?: string): LabelDisplay | undefined {
    if (!label) return undefined
    return label in ADDRESS_LABELS
        ? { kind: "key", key: ADDRESS_LABELS[label as keyof typeof ADDRESS_LABELS] }
        : { kind: "text", text: label }
}
