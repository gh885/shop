/** 本域展示词表（纯数据）：内置地址标签 code → 文案 key，以及由它派生的选项数组。展示解析函数在 display.ts，判定与类型在 rules.ts */

/** 内置地址标签 code → 展示文案的 i18n key（与后端 Address.LABEL_* 对齐）：*/
export const ADDRESS_LABELS = {
    HOME: "address.tag.HOME",
    WORK: "address.tag.WORK",
    SCHOOL: "address.tag.SCHOOL",
    PARENTS: "address.tag.PARENTS",
    FRIEND: "address.tag.FRIEND",
} as const

/** 内置标签 i18n key 的联合（= ADDRESS_LABELS 的值），供渲染处直接喂给 `t()` */
export type BuiltinLabelKey = (typeof ADDRESS_LABELS)[keyof typeof ADDRESS_LABELS]

/** 标签选择器的选项：表派生，顺序即表顺序 */
export const LABEL_OPTIONS = Object.entries(ADDRESS_LABELS).map(([value, label]) => ({
    value,
    label,
}))
