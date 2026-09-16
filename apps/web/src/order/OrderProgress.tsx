import { Check } from "lucide-react"

import { cn } from "@shop/ui-web"

import { ORDER_PROGRESS_STEP, ORDER_PROGRESS_STEPS } from "./constants"
import type { OrderStatus } from "./model"

/**
 * 订单进度条：固定「拍下宝贝 → 买家付款 → 卖家发货 → 确认收货」四步。
 *
 * 当前状态（ORDER_PROGRESS_STEP）决定进度：已完成步骤实心选中底 + 对勾，
 * 当前步骤空心描边，未达步骤灰。取消/异常态由外部决定是否渲染（直接不渲染）。
 */
export function OrderProgress({ status }: { status: OrderStatus }) {
    const step = ORDER_PROGRESS_STEP[status]

    return (
        <div className="flex items-center">
            {ORDER_PROGRESS_STEPS.map((label, index) => {
                const done = index < step
                const current = index === step
                return (
                    <div
                        key={label}
                        className={index === 0 ? "flex items-center" : "flex flex-1 items-center"}
                    >
                        {/* 节点圆点 */}
                        <div
                            className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
                                done
                                    ? "bg-accent text-accent-foreground"
                                    : current
                                      ? "border-2 border-accent-foreground text-accent-foreground"
                                      : "border border-border bg-background text-muted-foreground",
                            )}
                        >
                            {done ? (
                                <Check className="size-3.5" />
                            ) : (
                                <span className="text-xs">{index + 1}</span>
                            )}
                        </div>
                        <span
                            className={cn(
                                "ml-2 text-sm",
                                done || current ? "text-foreground" : "text-muted-foreground",
                            )}
                        >
                            {label}
                        </span>

                        {/* 连接线：非最后一个节点 */}
                        {index < ORDER_PROGRESS_STEPS.length - 1 && (
                            <div
                                className={cn(
                                    "h-px flex-1 min-w-12",
                                    index < step ? "bg-accent-foreground" : "bg-border",
                                )}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
