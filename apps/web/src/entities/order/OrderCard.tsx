import { Button } from "@shop/ui-web"

import { fenToYuan } from "@shop/api"

import { ORDER_STATUS_LABEL, type Order, type OrderStatus } from "./model"
import { Panel, PanelContent, PanelHeader } from "#/shared/ui/Panel"

/**
 * 订单卡片（京东/淘宝式订单列表项）。
 *
 * 结构：
 *   顶部订单信息条：时间 · 订单号（不截断）· 店铺 | 右侧 状态 + 订单详情按钮
 *   下方逐行订单项：主图 · 标题/规格/服务标签 · 单价×数量 · 实付金额 · 操作按钮
 *
 * 操作按钮按订单状态动态给出（见 ORDER_ACTIONS）。纯展示，回调交给外部。
 */

/** 按状态给出该订单可执行的操作（主操作 + 次操作），后续路由/接口落地后接真实动作 */
const ORDER_ACTIONS: Record<
    OrderStatus,
    { key: string; label: string; variant?: "default" | "outline" }[]
> = {
    pending_payment: [
        { key: "pay", label: "去付款", variant: "default" },
        { key: "cancel", label: "取消订单" },
    ],
    pending_shipment: [{ key: "remind", label: "提醒发货" }],
    pending_receipt: [
        { key: "logistics", label: "查看物流" },
        { key: "confirm", label: "确认收货", variant: "default" },
    ],
    pending_review: [
        { key: "review", label: "去评价", variant: "default" },
        { key: "rebuy", label: "再买一单" },
    ],
    completed: [
        { key: "rebuy", label: "加入购物车", variant: "default" },
        { key: "after_sale", label: "申请售后" },
        { key: "rebuy2", label: "再买一单" },
    ],
    cancelled: [{ key: "rebuy", label: "再买一单" }],
    refunding: [{ key: "view_refund", label: "查看退款" }],
}

const STATUS_COLOR: Record<OrderStatus, string> = {
    pending_payment: "text-primary",
    pending_shipment: "text-primary",
    pending_receipt: "text-primary",
    pending_review: "text-primary",
    completed: "text-muted-foreground",
    cancelled: "text-muted-foreground",
    refunding: "text-destructive",
}

const pad = (n: number) => String(n).padStart(2, "0")

/** 下单时间 ISO → 「YYYY-MM-DD HH:mm」展示 */
function formatTime(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface OrderCardProps {
    order: Order
    /** 点击订单详情 */
    onDetail?: (order: Order) => void
    /** 触发某操作（key 对应 ORDER_ACTIONS 里的 key） */
    onAction?: (order: Order, action: string) => void
}

export function OrderCard({ order, onDetail, onAction }: OrderCardProps) {
    const actions = ORDER_ACTIONS[order.status]

    return (
        <Panel className="text-sm">
            {/* 顶部订单信息条 */}
            <PanelHeader className="bg-muted/40">
                <span className="text-muted-foreground">{formatTime(order.createdAt)}</span>
                <span className="text-muted-foreground">
                    订单号：<span className="text-foreground">{order.orderNo}</span>
                </span>
                <span className="text-foreground">{order.shopName}</span>

                <div className="ml-auto flex items-center gap-4">
                    <span className={STATUS_COLOR[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDetail?.(order)}
                    >
                        订单详情
                    </Button>
                </div>
            </PanelHeader>

            {/* 订单项逐行 */}
            <PanelContent>
                {order.items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center gap-4 px-5 py-4"
                    >
                        {/* 主图 */}
                        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                            {item.image && (
                                <img
                                    src={item.image}
                                    alt={item.title}
                                    className="size-full object-cover"
                                />
                            )}
                        </div>

                        {/* 描述：标题 + 规格 + 服务标签 */}
                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm text-foreground">{item.title}</p>
                            {item.spec && (
                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                    {item.spec}
                                </p>
                            )}
                            {item.tags.length > 0 && (
                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                    {item.tags.join(" ")}
                                </p>
                            )}
                        </div>

                        {/* 金额：单价 · 划线原价 · 数量 */}
                        <div className="w-24 shrink-0 text-right">
                            <p className="text-sm font-bold text-foreground">
                                ¥{fenToYuan(item.price.amount)}
                            </p>
                            {item.originalPrice &&
                                item.originalPrice.amount > item.price.amount && (
                                    <p className="text-xs text-muted-foreground line-through">
                                        ¥{fenToYuan(item.originalPrice.amount)}
                                    </p>
                                )}
                            <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                        </div>

                        {/* 实付金额（订单维度，每行同步展示） */}
                        <div className="w-28 shrink-0 text-right">
                            <p className="text-sm font-bold text-foreground">
                                实付款{" "}
                                <span className="text-primary">
                                    ¥{fenToYuan(order.payAmount.amount)}
                                </span>
                            </p>
                            {order.shippingFee && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    含运费：¥{fenToYuan(order.shippingFee.amount)}
                                </p>
                            )}
                        </div>

                        {/* 订单操作：按状态动态渲染 */}
                        <div className="flex w-36 shrink-0 flex-col items-end gap-2">
                            {actions.map((a) => (
                                <Button
                                    key={a.key}
                                    variant={a.variant ?? "outline"}
                                    size="sm"
                                    className="min-w-24"
                                    onClick={() => onAction?.(order, a.key)}
                                >
                                    {a.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                ))}
            </PanelContent>
        </Panel>
    )
}
