import type { CSSProperties, ReactNode } from "react"

import { cn } from "@shop/ui-web"

type CssVars = CSSProperties & Record<`--${string}`, string>

/** 前提：左栏比右栏高；祖先链上不能有 overflow: hidden（会破坏 sticky）。 */
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
    const gridStyle: CssVars = { "--detail-columns": `minmax(0, 1fr) ${rightWidth}` }
    return (
        // 注意不能加 items-start：右列单元格要拉伸到行高（=左栏高度），
        // 右栏内的 sticky/mt-auto 约束范围才是整个双栏区域。
        // 窄屏收成一栏：右轨是写死的 594px / 结算栏 320px，不可压缩，
        // 375px 视口下整条购买/结算栏会被顶出右缘且没有任何滚动或折叠入口。
        <div
            className={cn("grid grid-cols-1 gap-y-6 lg:grid-cols-(--detail-columns)", gapClassName)}
            style={gridStyle}
        >
            <div className="min-w-0 self-start">{left}</div>
            <div className="flex flex-col">{right}</div>
        </div>
    )
}
