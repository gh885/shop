import { Check } from "lucide-react"

import { ORDER_PROGRESS_STEP, ORDER_PROGRESS_STEPS, type OrderStatus } from "#/entities/order"

/**
 * 订单进度条：固定「拍下宝贝 → 买家付款 → 卖家发货 → 确认收货」四步。
 *
 * 当前状态（ORDER_PROGRESS_STEP）决定进度：已完成步骤实心橙 + 对勾，
 * 当前步骤空心橙，未达步骤灰。取消/异常态由外部决定是否渲染（直接不渲染）。
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
                            className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                                done
                                    ? "bg-primary text-primary-foreground"
                                    : current
                                      ? "border-2 border-primary text-primary"
                                      : "border border-border bg-background text-muted-foreground"
                            }`}
                        >
                            {done ? (
                                <Check className="size-3.5" />
                            ) : (
                                <span className="text-xs">{index + 1}</span>
                            )}
                        </div>
                        <span
                            className={`ml-2 text-sm ${
                                done || current ? "text-foreground" : "text-muted-foreground"
                            }`}
                        >
                            {label}
                        </span>

                        {/* 连接线：非最后一个节点 */}
                        {index < ORDER_PROGRESS_STEPS.length - 1 && (
                            <div
                                className={`h-px flex-1 min-w-12 ${
                                    index < step ? "bg-primary" : "bg-border"
                                }`}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
