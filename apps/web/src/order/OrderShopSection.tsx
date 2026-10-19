import { Button, Image, Panel, PanelContent, PanelHeader } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"

import { ORDER_ITEM_ACTIONS } from "./constants"
import { orderItemActionLabel } from "./order-label"
import { orderItemKey, type OrderItem, type OrderItemAction } from "./rules"

export interface OrderShopSectionProps {
    order: { shopName: string | null }
    items: OrderItem[]
    canApplyAfterSale?: boolean
    onItemAction?: (action: OrderItemAction) => void
}

export function OrderShopSection({
    order,
    items,
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
                <div className="flex items-center gap-2">
                    <span className="inline-flex size-5 items-center justify-center rounded bg-secondary text-xs font-bold text-secondary-foreground">
                        {t("order.shop.badge")}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                        {order.shopName ?? t("order.card.shopClosed")}
                    </span>
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
                                    onClick={() => onItemAction?.(key)}
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
