import { copyWithNotify } from "@shop/app-kit"
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

/**
 * 可点击复制的文本：点击把「复制值」写入剪贴板，成功/失败用全局 toast 反馈。
 *
 * 用于表格里的商品名、ID 等需要「随手复制」的字段。是纯展示 + 轻交互组件：
 * - 默认保持普通文本形态（不显式摆复制图标），hover/focus 出现链接式下划线提示「可点击复制」
 * - 块级元素、占满可用宽度，子级 truncate 截断——同一容器内多个 CopyableText 能自然换行堆叠（名称一行、ID 一行）
 * - 复制的是 value（原始值）；children 只控制展示（名称截断、加 "ID:" 前缀等可随意）
 * - 复制与反馈不在这里：走 `@shop/app-kit` 的 `copyWithNotify`，三端同一句话术（物流页复制运单号共用它）
 */
export function CopyableText({
    value,
    label = "内容",
    className,
    children = value,
}: {
    /** 写入剪贴板的原始文本 */
    value: string
    /** 反馈文案里指代的字段名，如「商品名称」「商品 ID」，默认「内容」 */
    label?: string
    className?: string
    /** 展示内容；默认等于 value。传 children 可做截断/加前缀等展示性改造 */
    children?: React.ReactNode
}) {
    const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
        // 阻止冒泡：避免表格行内其他点击处理（如选中）被误触发
        e.stopPropagation()
        await copyWithNotify(value, label)
    }

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        onClick={copy}
                        aria-label={`复制${label}：${value}`}
                        className={cn(
                            // block + 占满可用宽度：同一纵列内多个 CopyableText 各占一行，不会挤到同一行
                            "block w-full min-w-0 max-w-full cursor-pointer text-left",
                            // 链接式 hover 提示（下划线暗示可点击复制），focus 同样体现
                            "underline-offset-2 decoration-dotted hover:underline focus-visible:underline focus-visible:outline-none",
                            className,
                        )}
                    >
                        <span className={cn("block truncate")}>{children}</span>
                    </button>
                }
            />
            <TooltipContent>点击复制{label}</TooltipContent>
        </Tooltip>
    )
}
