import {
    Button,
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
    Panel,
    PanelContent,
    PanelHeader,
} from "@shop/ui-web"

import { ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "./constants"
import { deriveOrderActions, type Order, type OrderAction } from "./model"
import { OrderActionButtons } from "./OrderActionButtons"
import { formatCountdown, useCountdown } from "#/shared/lib/use-countdown"
import { formatDateTime } from "@shop/app-kit"
import { fenToYuan } from "@shop/common"

import { Price } from "#/shared/ui/Price"

/**
 * 订单卡片（京东/淘宝式订单列表项）。
 *
 * 结构：
 *   顶部订单信息条：时间 · 订单号（不截断）· 店铺 | 右侧 状态 + 订单详情按钮
 *   下方逐行订单项：主图 · 标题 · 单价×数量 · 行小计
 *
 * 操作按钮按订单可执行动作渲染（后端算的，见 deriveOrderActions）。纯展示，回调交给外部。
 * 行项无独立 id（订单快照只留 productId/skuId），渲染 key 用 `productId+skuId+quantity`。
 */

/** 行项渲染 key：一行订单内可能同一 SKU 出现多次（不同快照），拼 quantity 兜底去重 */
const orderItemKey = (item: Order["items"][number]) =>
    `${item.productId}-${item.skuId}-${item.quantity}`

export interface OrderCardProps {
    order: Order
    /** 点击订单详情（订单由列表页持有，不回传） */
    onDetail?: () => void
    /** 触发某操作（key 对应 ORDER_ACTIONS 里的 key） */
    onAction?: (action: OrderAction) => void
    /** 进行中的操作 key：对应按钮禁用，防重复提交 */
    pendingAction?: OrderAction
}

export function OrderCard({ order, onDetail, onAction, pendingAction }: OrderCardProps) {
    // 待付款订单展示付款截止倒计时（其余状态不显示）
    const pending = order.status === "pending_payment"
    const { seconds } = useCountdown(pending ? order.payExpireAt : "")

    return (
        <Panel className="text-sm">
            {/* 顶部订单信息条 */}
            <PanelHeader className="bg-muted/40">
                <span className="text-muted-foreground">{formatDateTime(order.createdAt)}</span>
                <span className="text-muted-foreground">
                    订单号：<span className="text-foreground">{order.orderNo}</span>
                </span>
                <span className="text-foreground">{order.shopName ?? "店铺已关闭"}</span>

                <div className="ml-auto flex items-center gap-4">
                    {pending && (
                        <span className="text-xs font-medium text-destructive tabular-nums">
                            剩 {formatCountdown(seconds)}
                        </span>
                    )}
                    <span className={ORDER_STATUS_COLOR[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDetail?.()}
                    >
                        订单详情
                    </Button>
                </div>
            </PanelHeader>

            {/* 订单项逐行 */}
            <PanelContent>
                <ItemGroup>
                    {order.items.map((item) => (
                        <Item
                            key={orderItemKey(item)}
                            className="flex-nowrap px-5 py-4"
                        >
                            {/* 主图 */}
                            <ItemMedia
                                variant="image"
                                className="size-16 rounded-md bg-muted"
                            >
                                {item.image && (
                                    <img
                                        src={item.image}
                                        alt={item.title}
                                        className="object-cover"
                                    />
                                )}
                            </ItemMedia>

                            {/* 描述：标题 */}
                            <ItemContent>
                                <ItemTitle className="line-clamp-2 w-full">{item.title}</ItemTitle>
                                <ItemDescription className="line-clamp-1 w-full">
                                    规格：{item.skuId ? "已选规格" : "默认规格"}
                                </ItemDescription>
                            </ItemContent>

                            {/* 金额：单价 · 划线原价 · 数量 */}
                            <div className="w-24 shrink-0 text-right">
                                <Price
                                    value={item.price.amount}
                                    className="text-sm text-foreground"
                                />
                                {item.originalPrice !== null &&
                                    item.originalPrice.amount > item.price.amount && (
                                        <p className="text-xs text-muted-foreground line-through">
                                            ¥{fenToYuan(item.originalPrice.amount)}
                                        </p>
                                    )}
                                <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                            </div>

                            {/* 行小计 */}
                            <div className="w-28 shrink-0 text-right">
                                <p className="text-sm font-bold text-foreground">
                                    小计{" "}
                                    <Price
                                        value={item.amount.amount}
                                        className="text-sm font-bold text-primary"
                                    />
                                </p>
                            </div>

                            {/* 订单操作：按状态动态渲染 */}
                            <ItemActions className="w-36 gap-2">
                                <OrderActionButtons
                                    actions={deriveOrderActions(order, "card")}
                                    disabledKey={pendingAction}
                                    onAction={onAction}
                                />
                            </ItemActions>
                        </Item>
                    ))}
                </ItemGroup>
            </PanelContent>
        </Panel>
    )
}
