import type { ReactNode } from "react"

/**
 * 详情页双栏容器（淘宝/京东「左滚右停」交互）：
 *
 * - 左栏（店铺条 + 画廊 + 图文描述）内容长，随页面正常滚动
 * - 右栏（购买区）position: sticky 钉在视口 top 偏移处不动
 * - bottom 插槽（CTA 悬浮卡）位于右列单元格的流末尾（mt-auto 压底），
 *   自身 sticky bottom 钉视口底——双栏区域未滚完时常驻可见，
 *   接近容器末尾时落进流位、随页面一起滚走
 *
 * 前提：左栏比右栏高；祖先链上不能有 overflow: hidden（会破坏 sticky）。
 */
export function DetailColumns({
    left,
    right,
    bottom,
}: {
    left: ReactNode
    right: ReactNode
    bottom?: ReactNode
}) {
    return (
        // 注意不能加 items-start：右列单元格要拉伸到行高（=左栏高度），
        // CTA 的流位置才能压到容器底部，sticky 约束范围才是整个双栏区域
        <div className="grid grid-cols-[minmax(0,1fr)_580px] gap-x-10">
            <div className="min-w-0 self-start">{left}</div>
            <div className="flex flex-col">
                <aside className="sticky top-4">{right}</aside>
                {bottom && <div className="sticky bottom-5 z-30 mt-auto">{bottom}</div>}
            </div>
        </div>
    )
}
