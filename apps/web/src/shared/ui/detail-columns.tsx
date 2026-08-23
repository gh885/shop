import type { ReactNode } from "react"

/**
 * 通用「左滚右停」双栏容器（详情页、购物车页共用）：
 *
 * - 左栏内容长，随页面正常滚动
 * - 右栏 position: sticky 钉在视口 top 偏移处不动
 * - bottom 插槽（CTA 悬浮卡）位于右列单元格的流末尾（mt-auto 压底），
 *   自身 sticky bottom 钉视口底——双栏区域未滚完时常驻可见，
 *   接近容器末尾时落进流位、随页面一起滚走
 *
 * 前提：左栏比右栏高；祖先链上不能有 overflow: hidden（会破坏 sticky）。
 *
 * @param rightWidth 右栏轨道宽（CSS 值），详情页偏宽、购物车结算栏偏窄
 */
export function DetailColumns({
    left,
    right,
    bottom,
    rightWidth = "580px",
}: {
    left: ReactNode
    right: ReactNode
    bottom?: ReactNode
    rightWidth?: string
}) {
    return (
        // 注意不能加 items-start：右列单元格要拉伸到行高（=左栏高度），
        // CTA 的流位置才能压到容器底部，sticky 约束范围才是整个双栏区域。
        // 列宽不用 Tailwind 的 grid-cols-[...]（无法按 prop 动态拼接），改用内联 gridTemplateColumns。
        <div
            className="grid gap-x-10"
            style={{ gridTemplateColumns: `minmax(0, 1fr) ${rightWidth}` }}
        >
            <div className="min-w-0 self-start">{left}</div>
            <div className="flex flex-col">
                <aside className="sticky top-4">{right}</aside>
                {bottom && <div className="sticky bottom-5 z-30 mt-auto">{bottom}</div>}
            </div>
        </div>
    )
}
