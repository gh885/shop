import * as React from "react"
import { defineChart, dot, lineY } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleBand } from "@tanstack/charts/scales/band"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { tooltip } from "@tanstack/charts/tooltip"

import { cn } from "src/lib/utils"

/** 一个数据点：x 轴标签（日期 / 类目）+ 数值。金额已在服务端算成展示数值，这里只收纯数。 */
export interface TrendPoint {
    label: string
    value: number
}

export interface TrendChartProps {
    /** 时间序列点，按 x 轴从左到右的顺序排列 */
    points: readonly TrendPoint[]
    /** 读屏名：说清这张图在表达什么（DESIGN.md §8.1，纯图表也要有可访问名） */
    ariaLabel: string
    /** 固定高度、宽度随容器；缺省 240 */
    height?: number
    className?: string
}

/** 折线趋势图：TanStack Charts 声明式 definition 收进 ui-web 单一出口（DESIGN.md §1）。definition 捕获 points，必须 useMemo——每次渲染重建会重画整个 scene。配色走 CSS 变量，不写死十六进制（DESIGN.md §9.3） */
export function TrendChart({ points, ariaLabel, height = 240, className }: TrendChartProps) {
    const definition = React.useMemo(
        () =>
            defineChart({
                marks: [
                    lineY(points, { x: "label", y: "value", strokeWidth: 2 }),
                    dot(points, { x: "label", y: "value" }),
                ],
                scales: {
                    x: { scale: () => scaleBand().padding(0.2) },
                    y: { scale: scaleLinear, nice: true, grid: true },
                },
                tooltip,
            }),
        [points],
    )

    return (
        <div
            className={cn(
                // 结构墨色（网格/轴/刻度）走 currentColor，text-muted-foreground 把它定成次要色
                "w-full text-muted-foreground",
                // svg 带 tabindex=0 供键盘逐点探索；鼠标点击不露默认黑框，键盘聚焦才画主题 ring（DESIGN.md §8.1）
                "[&_svg]:outline-none [&_svg]:focus-visible:[outline:2px_solid_var(--color-ring)] [&_svg]:focus-visible:[outline-offset:2px]",
                className,
            )}
        >
            <Chart
                definition={definition}
                height={height}
                ariaLabel={ariaLabel}
            />
        </div>
    )
}
