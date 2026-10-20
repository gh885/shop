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
    Separator,
} from "@shop/ui-web"

import { ChevronRight, Package, Store } from "lucide-react"

import { AFTER_SALE_BADGE_TONE, MAIN_PROGRESS_TONE, ORDER_CARD_STATUS_TONE } from "./constants"
import {
    afterSaleBadgeLabel,
    mainProgressHint,
    mainProgressLabel,
    orderStatusLabel,
} from "./order-label"
import {
    canPay,
    deriveOrderActions,
    isShipOverdue,
    orderItemKey,
    orderTotalQuantity,
    type OrderAction,
    type OrderStatus,
    type Trade,
    type TradeOrder,
} from "./rules"
import { toOrderActionItems } from "./display"
import { OrderActionButtons } from "./OrderActionButtons"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { formatMoney, sumMoney } from "@shop/common/domain"
import { Price } from "#/shared/ui/Price"

export interface TradeCardProps {
    trade: Trade
    /** 进某张子订单的详情页（售后、物流、评价都挂在子订单上） */
    onDetail?: (orderId: string) => void
    /** 子订单级动作：取消 / 确认收货 / 看物流 */
    onAction?: (orderId: string, action: OrderAction) => void
    /** 主订单级动作：付款 */
    onPay?: (tradeId: string) => void
    pendingAction?: OrderAction
}

/**
 * 买家订单卡片 = 一张主订单（一次结算）。
 *
 * <p>徽章是<b>主进度</b>（后端按 §5.3 算好的那一条线），店铺段各自带子订单的履约状态：
 * 一次多店结算在买家眼里是一笔钱、一条进度，在卖家里是两张单、两条履约线，两者在这里同屏但不相混。
 */
export function TradeCard({ trade, onDetail, onAction, onPay, pendingAction }: TradeCardProps) {
    const t = useT()
    const { locale } = useI18n()
    const pending = canPay(trade.mainProgress)
    const { seconds } = useDeadline(pending ? trade.payExpireAt : "")

    return (
        <Panel className="@container/order">
            <PanelHeader
                variant="muted"
                className="flex-wrap"
            >
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                            {t("order.card.placedAt", {
                                time: formatDateTime(trade.createdAt, locale),
                            })}
                        </span>
                        <span className="min-w-0 wrap-anywhere">
                            {t("order.card.tradeNo", { tradeNo: trade.tradeNo })}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {mainProgressHint(trade.mainProgress, t)}
                    </p>
                </div>

                <div className="ms-auto flex flex-wrap items-center gap-4">
                    {pending && (
                        <span className="text-xs font-medium text-destructive tabular-nums">
                            {t("order.card.remaining", { time: formatCountdown(seconds) })}
                        </span>
                    )}
                    <Badge variant={MAIN_PROGRESS_TONE[trade.mainProgress]}>
                        {mainProgressLabel(trade.mainProgress, t)}
                    </Badge>
                    {trade.afterSaleBadge !== "none" && (
                        <Badge variant={AFTER_SALE_BADGE_TONE[trade.afterSaleBadge]}>
                            {afterSaleBadgeLabel(trade.afterSaleBadge, t)}
                        </Badge>
                    )}
                    {pending && (
                        <Button
                            variant="cta"
                            size="sm"
                            disabled={pendingAction === "pay"}
                            onClick={() => onPay?.(trade.id)}
                        >
                            {t("order.action.pay")}
                        </Button>
                    )}
                </div>
            </PanelHeader>

            <PanelContent>
                {trade.orders.map((order, index) => (
                    <div key={order.id}>
                        {index > 0 && <Separator />}
                        <TradeShopSection
                            order={order}
                            tradeProgress={trade.mainProgress}
                            pendingAction={pendingAction}
                            onDetail={onDetail}
                            onAction={onAction}
                        />
                    </div>
                ))}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 px-5 py-4">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Package
                            aria-hidden="true"
                            className="size-4 shrink-0"
                        />
                        <span className="tabular-nums">
                            {t("order.card.itemsCount", {
                                quantity: trade.orders.reduce(
                                    (sum, order) => sum + orderTotalQuantity(order.items),
                                    0,
                                ),
                            })}
                        </span>
                    </p>
                    <p className="ms-auto flex flex-wrap items-baseline gap-2">
                        <span className="text-muted-foreground">{t("order.card.amount")}</span>
                        <Price
                            value={trade.payAmount}
                            className="text-lg font-medium text-primary-subtle-foreground"
                        />
                    </p>
                </div>
            </PanelContent>
        </Panel>
    )
}

function TradeShopSection({
    order,
    tradeProgress,
    pendingAction,
    onDetail,
    onAction,
}: {
    order: TradeOrder
    tradeProgress: Trade["mainProgress"]
    pendingAction: OrderAction | undefined
    onDetail: ((orderId: string) => void) | undefined
    onAction: ((orderId: string, action: OrderAction) => void) | undefined
}) {
    const t = useT()
    const { locale } = useI18n()
    // 主订单没付款时各店铺段都不该说「待发货」：钱还没到，货不可能动
    const status: OrderStatus =
        tradeProgress === "pending_payment" ? "pending_payment" : order.status
    const itemTotal = sumMoney(order.items.map((item) => item.amount))

    return (
        <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                    <Store
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 wrap-anywhere">
                        {order.shopName ?? t("order.card.shopClosed")}
                    </span>
                </span>
                <Badge variant={ORDER_CARD_STATUS_TONE[status]}>
                    {orderStatusLabel(status, t)}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {t("order.card.orderNo", { orderNo: order.orderNo })}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="ms-auto"
                    onClick={() => onDetail?.(order.id)}
                >
                    {t("order.card.detail")}
                    <ChevronRight
                        aria-hidden="true"
                        data-icon="inline-end"
                    />
                </Button>
            </div>

            <ShopShipHint order={order} />

            <div>
                {order.items.map((item) => (
                    <Item
                        key={orderItemKey(item)}
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
                                    {item.shippedQuantity > 0 &&
                                        ` · ${t("order.cardItem.shipped", { quantity: item.shippedQuantity })}`}
                                    {item.refundedQuantity > 0 &&
                                        ` · ${t("order.cardItem.refunded", { quantity: item.refundedQuantity })}`}
                                </ItemDescription>
                            </ItemContent>
                        </div>

                        <div className="ms-auto w-24 shrink-0 space-y-1 text-end tabular-nums">
                            <p className="text-xs text-muted-foreground">
                                {t("order.cardItem.unitPrice")}
                            </p>
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
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <p className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-muted-foreground">{t("order.card.goodsTotal")}</span>
                    <span className="tabular-nums">{formatMoney(itemTotal, locale)}</span>
                </p>
                <ItemActions className="ms-auto max-w-full flex-wrap justify-end">
                    <OrderActionButtons
                        actions={toOrderActionItems(
                            deriveOrderActions({ ...order, status }, "card"),
                            status,
                            "card",
                        )}
                        disabledKey={pendingAction}
                        onAction={(action) => onAction?.(order.id, action)}
                    />
                </ItemActions>
            </div>
        </div>
    )
}

/** 发货时限只做催办提示：过点也不由系统代关单（ORD-27） */
function ShopShipHint({ order }: { order: TradeOrder }) {
    const { locale } = useI18n()
    const t = useT()
    if (order.status !== "pending_shipment" && order.status !== "partially_shipped") return null
    if (order.shipExpireAt === null) return null
    const overdue = isShipOverdue(order)
    return (
        <p
            className={
                overdue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"
            }
        >
            {overdue
                ? t("order.cardItem.overdue", {
                      time: formatDateTime(order.shipExpireAt, locale),
                  })
                : t("order.cardItem.shipBy", {
                      time: formatDateTime(order.shipExpireAt, locale),
                  })}
        </p>
    )
}
