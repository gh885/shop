import type { ReactNode } from "react"
import { cn } from "@shop/ui-web"

/**
 * 发布页的区块卡片：一屏多块（当前类目 / 基础信息 / …），
 * 每块一张浅灰卡 + 标题，id 供顶部锚点页签滚动定位。
 * scroll-mt 预留吸顶页签高度，滚过去不会被页签盖住标题。
 */
export function SectionCard({
    id,
    title,
    action,
    className,
    children,
}: {
    id: string
    title: string
    /** 标题右侧的次要操作（如「切换类目」） */
    action?: ReactNode
    className?: string
    children: ReactNode
}) {
    return (
        <section
            id={id}
            className={cn("scroll-mt-20 rounded-2xl bg-background p-6 shadow-sm", className)}
        >
            <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight">{title}</h2>
                {action}
            </div>
            {children}
        </section>
    )
}

/** 表单行：左标签（定宽右对齐）+ 右控件，千牛式横排 */
export function FieldRow({
    label,
    required = false,
    hint,
    error,
    htmlFor,
    children,
}: {
    label: string
    required?: boolean
    /** 控件下方的灰字说明（写作建议、格式要求） */
    hint?: ReactNode
    error?: string
    htmlFor?: string
    children: ReactNode
}) {
    return (
        <div className="flex gap-4 py-2.5">
            <label
                htmlFor={htmlFor}
                className="w-24 shrink-0 pt-2 text-left text-sm text-foreground/90"
            >
                {label}
                {required && <span className="ml-0.5 text-destructive">*</span>}
            </label>
            <div className="min-w-0 flex-1 space-y-1.5">
                {children}
                {error ? (
                    <p className="text-xs text-destructive">{error}</p>
                ) : hint ? (
                    <p className="text-xs text-muted-foreground">{hint}</p>
                ) : null}
            </div>
        </div>
    )
}
