import { useQuery } from "@tanstack/react-query"
import { Button, Image, Panel, PanelContent, PanelHeader } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"
import { Price } from "#/shared/ui/Price"

import { ORDER_ITEM_ACTIONS } from "./constants"
import { orderItemActionLabel } from "./order-label"
import { sellerPackagesOptions } from "./queries"
import { orderItemKey, type OrderItem, type OrderItemAction } from "./rules"

export interface OrderShopSectionProps {
    order: { shopId: string; orderNo: string }
    items: OrderItem[]
    /** 子单 id：发货后用它取包裹，算「N 天后自动确认收货」倒计时 */
    sellerOrderId?: string
    /** 子单有在途包裹（shipped / partial_shipped）才查询 */
    shipping?: boolean
    canApplyAfterSale?: boolean
    onItemAction?: (action: OrderItemAction, item: OrderItem) => void
}

export function OrderShopSection({
    order,
    items,
    sellerOrderId,
    shipping = false,
    canApplyAfterSale = false,
    onItemAction,
}: OrderShopSectionProps) {
    const t = useT()
    const itemActions = ORDER_ITEM_ACTIONS.filter(
        (key) => key !== "after_sale" || canApplyAfterSale,
    )
    return (
        <Panel>
            <PanelHeader>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex size-5 items-center justify-center rounded bg-secondary text-xs font-bold text-secondary-foreground">
                        {t("order.shop.badge")}
                    </span>
                    <span className="text-sm font-medium text-foreground">{order.orderNo}</span>
                    {sellerOrderId && shipping && (
                        <AutoReceiveCountdown sellerOrderId={sellerOrderId} />
                    )}
                </div>
                <Button
                    variant="link"
                    size="sm"
                    className="ml-auto"
                >
                    {t("order.shop.snapshot")}
                </Button>
            </PanelHeader>

            <PanelContent>
                {items.map((item) => (
                    <div
                        key={orderItemKey(item)}
                        className="grid grid-cols-2 items-center gap-4 px-5 py-4 xl:flex"
                    >
                        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                            <Image
                                src={item.image}
                                alt={item.title}
                                className="size-full"
                            />
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm text-foreground">{item.title}</p>
                        </div>

                        <div className="w-20 shrink-0 text-right text-sm">
                            <Price
                                value={item.price}
                                className="text-foreground"
                            />
                            <span className="ml-1 text-xs text-muted-foreground">
                                x{item.quantity}
                            </span>
                        </div>

                        <div className="w-20 shrink-0 text-right text-sm">
                            <Price
                                value={item.amount}
                                className="text-foreground"
                            />
                        </div>

                        <div className="col-span-2 flex flex-wrap gap-2 xl:w-40 xl:shrink-0 xl:flex-col xl:items-end">
                            {itemActions.map((key) => (
                                <Button
                                    key={key}
                                    variant="outline"
                                    size="sm"
                                    className="min-w-24"
                                    onClick={() => onItemAction?.(key, item)}
                                >
                                    {orderItemActionLabel(key, t)}
                                </Button>
                            ))}
                        </div>
                    </div>
                ))}
            </PanelContent>
        </Panel>
    )
}

/**
 * 「N 天后自动确认收货」倒计时：取在途包裹里最近的 autoReceiveAt（fulfillment 按
 * shippedAt + 宽限期算好下发，前端不抄天数）。包裹已签收 / 还没发货时没有任何东西可倒，
 * 静默不渲染——一个提示条不值得占一个骨架屏。
 */
function AutoReceiveCountdown({ sellerOrderId }: { sellerOrderId: string }) {
    const t = useT()
    const { data: packages } = useQuery({
        ...sellerPackagesOptions(sellerOrderId),
        enabled: true,
    })
    const pending = (packages ?? [])
        .map((pkg) => pkg.autoReceiveAt)
        .filter((at): at is string => at !== null)
        .sort()
    const next = pending[0]
    const { seconds } = useDeadline(next ?? "")
    if (next === undefined || seconds <= 0) return null
    return (
        <span className="text-xs tabular-nums text-muted-foreground">
            {t("order.countdown.autoConfirmAfter", { time: formatCountdown(seconds) })}
        </span>
    )
}
