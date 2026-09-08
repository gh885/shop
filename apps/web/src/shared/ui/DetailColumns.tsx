import type { ReactNode } from "react"

/**
 * 通用「左滚右停」双栏容器（详情页、购物车页共用）：
 *
 * - 左栏内容长，随页面正常滚动
 * - 右栏一列到底：单元格拉伸到行高（= 左栏高度），内部结构由调用方决定——
 *   常见是购买面板 + 动作卡包在一个 `sticky top-4` 容器里，整块随页面滚动
 *
 * 前提：左栏比右栏高；祖先链上不能有 overflow: hidden（会破坏 sticky）。
 *
 * @param rightWidth 右栏轨道宽（CSS 值），详情页偏宽、购物车结算栏偏窄
 * @param gapClassName 列间距（详情页 48px 对齐参考站，购物车默认 40px）
 */
export function DetailColumns({
    left,
    right,
    rightWidth = "580px",
    gapClassName = "gap-x-10",
}: {
    left: ReactNode
    right: ReactNode
    rightWidth?: string
    gapClassName?: string
}) {
    return (
        // 注意不能加 items-start：右列单元格要拉伸到行高（=左栏高度），
        // 右栏内的 sticky/mt-auto 约束范围才是整个双栏区域。
        // 列宽不用 Tailwind 的 grid-cols-[...]（无法按 prop 动态拼接），改用内联 gridTemplateColumns。
        <div
            className={`grid ${gapClassName}`}
            style={{ gridTemplateColumns: `minmax(0, 1fr) ${rightWidth}` }}
        >
            <div className="min-w-0 self-start">{left}</div>
            <div className="flex flex-col">{right}</div>
        </div>
    )
}
