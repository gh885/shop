import type { CSSProperties, ReactNode } from "react"

import { cn } from "@shop/ui-web"

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
        // 列宽按 prop 动态给：把整条 grid-template-columns 塞进 CSS 变量，
        // 由 lg:grid-cols-(--detail-columns) 消费——不需要内联 gridTemplateColumns，也不产生任意值。
        // 窄屏收成一栏：右轨是写死的 594px / 结算栏 320px，不可压缩，
        // 375px 视口下整条购买/结算栏会被顶出右缘且没有任何滚动或折叠入口。
        <div
            className={cn("grid grid-cols-1 gap-y-6 lg:grid-cols-(--detail-columns)", gapClassName)}
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CSS 变量键不在 CSSProperties 内，断言是仓库既有写法
            style={{ "--detail-columns": `minmax(0, 1fr) ${rightWidth}` } as CSSProperties}
        >
            <div className="min-w-0 self-start">{left}</div>
            <div className="flex flex-col">{right}</div>
        </div>
    )
}
