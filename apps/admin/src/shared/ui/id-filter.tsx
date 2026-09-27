import { Input } from "@shop/ui-web"

/**
 * 列表筛选栏里的「按 ID 筛」输入框。
 *
 * 管理端三张列表页都要「输入 ID + 回车应用」这一格（券的持券人/店铺、审计的操作人/对象、
 * 店铺治理的关键字），此前各写一遍：连「回车提交要判 `isComposing`」这个中文输入法细节都抄了三遍——
 * 漏掉它时，用户用拼音输入法打完按回车会提前提交半截内容，而这种 bug 不会让任何测试变红。
 *
 * 宽度由调用点给**字面量** className（DESIGN.md：ui-web 组件上的 className 必须是静态串，
 * 动态拼接扫不出来），本组件只负责输入与提交这一个行为。
 */
export function IdFilter({
    label,
    value,
    onChange,
    onSubmit,
    className = "w-48",
}: {
    label: string
    value: string
    onChange: (value: string) => void
    onSubmit: () => void
    /** 宽度类（字面量）：默认 48，中文标签更长的调用点自己给 `w-52` */
    className?: string
}) {
    return (
        <Input
            aria-label={label}
            placeholder={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
                // isComposing：中文输入法拼到一半的 Enter 是「选词」不是「提交」
                if (event.key === "Enter" && !event.nativeEvent.isComposing) onSubmit()
            }}
            className={className}
        />
    )
}
