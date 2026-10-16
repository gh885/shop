import {
    Badge,
    Button,
    Image,
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
    Panel,
    PanelContent,
    PanelHeader,
} from "@shop/ui-web"

import { ChevronRight, Package, Store } from "lucide-react"

import { ORDER_CARD_STATUS_TONE } from "./constants"
import { orderCardHint, orderStatusLabel } from "./order-label"
import {
    deriveOrderActions,
    isShipOverdue,
    orderItemKey,
    orderTotalQuantity,
    type Order,
    type OrderAction,
    type OrderItem,
} from "./model"
import { OrderActionButtons } from "./OrderActionButtons"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { formatMoney, sumMoney } from "@shop/common/domain"
import { Price } from "#/shared/ui/Price"

export interface OrderCardProps {
    order: Order
    onDetail?: () => void
    onAction?: (action: OrderAction) => void
    pendingAction?: OrderAction
}

export function OrderCard({ order, onDetail, onAction, pendingAction }: OrderCardProps) {
    const pending = order.status === "pending_payment"
    const { seconds } = useDeadline(pending ? order.payExpireAt : "")

    return (
        <Panel className="@container/order">
            <OrderCardHeader
                order={order}
                seconds={pending ? seconds : undefined}
                onDetail={onDetail}
            />

            <PanelContent>
                <div>
                    {order.items.map((item) => (
                        <OrderCardItem
                            key={orderItemKey(item)}
                            item={item}
                        />
                    ))}
                </div>

                <OrderCardFooter
                    order={order}
                    pendingAction={pendingAction}
                    onAction={onAction}
                />
            </PanelContent>
        </Panel>
    )
}

function OrderCardFooter({
    order,
    pendingAction,
    onAction,
}: {
    order: Order
    pendingAction: OrderAction | undefined
    onAction: ((action: OrderAction) => void) | undefined
}) {
    const t = useT()
    const { locale } = useI18n()
    const quantity = orderTotalQuantity(order.items)
    const itemTotal = sumMoney(order.items.map((item) => item.amount))

    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4">
            <div className="min-w-0 flex-1 basis-full space-y-2 @3xl/order:basis-0">
                <p className="flex items-center gap-2 text-sm">
                    <Package
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="tabular-nums">{t("order.card.itemsCount", { quantity })}</span>
                </p>
                <OrderCardHint order={order} />
            </div>
            <div className="ms-auto space-y-1 text-end">
                <p className="flex flex-wrap justify-end gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>{t("order.card.goodsTotal")}</span>
                    <span>{formatMoney(itemTotal, locale)}</span>
                </p>
                <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-muted-foreground">{t("order.card.amount")}</span>
                    <Price
                        value={order.payAmount}
                        className="text-lg font-medium text-primary-subtle-foreground"
                    />
                </p>
            </div>
            <ItemActions className="ms-auto max-w-full flex-wrap justify-end @3xl/order:ms-0">
                <OrderActionButtons
                    actions={deriveOrderActions(order, "card")}
                    disabledKey={pendingAction}
                    onAction={onAction}
                />
            </ItemActions>
        </div>
    )
}

function OrderCardHeader({
    order,
    seconds,
    onDetail,
}: {
    order: Order
    seconds: number | undefined
    onDetail: (() => void) | undefined
}) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <PanelHeader
            variant="muted"
            className="flex-wrap"
        >
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                    <Store
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 font-medium wrap-anywhere">
                        {order.shopName ?? t("order.card.shopClosed")}
                    </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                        {t("order.card.placedAt", {
                            time: formatDateTime(order.createdAt, locale),
                        })}
                    </span>
                    <span className="min-w-0 wrap-anywhere">
                        {t("order.card.orderNo", { orderNo: order.orderNo })}
                    </span>
                </div>
            </div>

            <div className="ms-auto flex flex-wrap items-center gap-4">
                {seconds !== undefined && (
                    <span className="text-xs font-medium text-destructive tabular-nums">
                        {t("order.card.remaining", { time: formatCountdown(seconds) })}
                    </span>
                )}
                <Badge variant={ORDER_CARD_STATUS_TONE[order.status]}>
                    {orderStatusLabel(order.status, t)}
                </Badge>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDetail?.()}
                >
                    {t("order.card.detail")}
                    <ChevronRight
                        aria-hidden="true"
                        data-icon="inline-end"
                    />
                </Button>
            </div>
        </PanelHeader>
    )
}

function OrderCardItem({ item }: { item: OrderItem }) {
    const t = useT()
    const { locale } = useI18n()
    return (
        <Item
            size="lg"
            variant="plain"
        >
            <div className="flex min-w-0 flex-1 basis-full items-center gap-3 @2xl/order:basis-0">
                <ItemMedia
                    variant="thumbnail"
                    className="size-20"
                >
                    <Image
                        src={item.image}
                        alt={item.title}
                        className="size-full"
                    />
                </ItemMedia>

                <ItemContent className="min-w-0">
                    <ItemTitle
                        lines={2}
                        className="w-full wrap-anywhere"
                    >
                        {item.title}
                    </ItemTitle>
                    <ItemDescription lines={1}>
                        {t("order.cardItem.quantity", { quantity: item.quantity })}
                    </ItemDescription>
                </ItemContent>
            </div>

            <div className="ms-auto w-24 shrink-0 space-y-1 text-end tabular-nums">
                <p className="text-xs text-muted-foreground">{t("order.cardItem.unitPrice")}</p>
                <Price
                    value={item.price}
                    className="text-sm text-foreground"
                />
                {item.originalPrice !== undefined && (
                    <p className="text-xs text-muted-foreground line-through">
                        {formatMoney(item.originalPrice, locale)}
                    </p>
                )}
            </div>

            <div className="w-28 shrink-0 text-end">
                <p className="text-sm font-bold text-foreground">
                    {t("order.cardItem.subtotal")}{" "}
                    <Price
                        value={item.amount}
                        className="text-sm text-foreground"
                    />
                </p>
            </div>
        </Item>
    )
}

function OrderCardHint({ order }: { order: Order }) {
    const { locale } = useI18n()
    const t = useT()
    const shipDeadline = order.status === "pending_shipment" ? order.shipExpireAt : undefined
    if (!shipDeadline)
        return <p className="text-xs text-muted-foreground">{orderCardHint(order.status, t)}</p>
    const overdue = isShipOverdue({ shipExpireAt: shipDeadline })
    return (
        <p
            className={
                overdue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"
            }
        >
            {overdue
                ? t("order.cardItem.overdue", { time: formatDateTime(shipDeadline, locale) })
                : t("order.cardItem.shipBy", { time: formatDateTime(shipDeadline, locale) })}
        </p>
    )
}
