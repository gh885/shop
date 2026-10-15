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

/**
 * 折线趋势图：把 TanStack Charts 的声明式 definition 收进 ui-web 单一出口（DESIGN.md §1「一个概念一个出口」）。
 * definition 捕获了 points，按官方要求用 useMemo 缓存——每次渲染重建会重画整个 scene。
 * 配色分两路，都不写死十六进制（DESIGN.md §9.3）：
 * - 数据系列（线/点）：不写 stroke/fill，落到库的 color scale → palette[0] → var(--ts-chart-1)（styles.css 定为 info 蓝）
 * - 结构墨色（网格/轴/刻度文字）：库默认走 currentColor，所以容器的 `text-muted-foreground` 决定它们——次要墨色，不抢数据线
 */
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
                // 结构墨色（网格/轴/刻度）走 currentColor，这里把它定成次要色，数据线（--ts-chart-1）不受影响
                "w-full text-muted-foreground",
                // 图表根 <svg> 带 tabindex=0 供键盘逐点探索数据，TanStack 不自带 focus 样式，
                // 点击会残留浏览器默认黑框。这里：鼠标点击不露框，键盘聚焦才画主题 ring（DESIGN.md §8.1）。
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
