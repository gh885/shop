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

import { ORDER_CARD_STATUS_META, ORDER_STATUS_LABEL } from "./constants"
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
import { formatMoney, sumMoney } from "@shop/common/domain"
import { Price } from "#/shared/ui/Price"

/**
 * 订单卡片（京东/淘宝式订单列表项）。
 *
 * 结构：
 *   顶部订单信息条：时间 · 订单号（不截断）· 店铺 | 右侧 状态 + 订单详情按钮
 *   下方逐行订单项：主图 · 标题 · 单价×数量 · 行小计
 *   底部整单金额与操作：只渲染一次，窄容器内自动换行，避免按钮被面板裁切。
 *
 * 操作按钮按订单可执行动作渲染（后端算的）。纯展示，回调交给外部。
 * 行项无独立 id（订单快照只留 productId/skuId），渲染 key 用 `productId+skuId+quantity`。
 */

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
    const { seconds } = useDeadline(pending ? order.payExpireAt : "")

    return (
        <Panel className="@container/order">
            <OrderCardHeader
                order={order}
                seconds={pending ? seconds : undefined}
                onDetail={onDetail}
            />

            {/* 订单项逐行 */}
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

/** 整单共用的那一行：件数 + 状态提示 + 金额 + 操作按钮（不能随商品行重复） */
function OrderCardFooter({
    order,
    pendingAction,
    onAction,
}: {
    order: Order
    pendingAction: OrderAction | undefined
    onAction: ((action: OrderAction) => void) | undefined
}) {
    const { locale } = useI18n()
    const quantity = orderTotalQuantity(order.items)
    // 列表 itemAmount 是净额占位；商品总额只能从成交快照的行小计求和。
    const itemTotal = sumMoney(order.items.map((item) => item.amount))

    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4">
            <div className="min-w-0 flex-1 basis-full space-y-2 @3xl/order:basis-0">
                <p className="flex items-center gap-2 text-sm">
                    <Package
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="tabular-nums">共 {quantity} 件商品</span>
                </p>
                <OrderCardHint order={order} />
            </div>
            <div className="ms-auto space-y-1 text-end">
                <p className="flex flex-wrap justify-end gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>商品合计</span>
                    <span>{formatMoney(itemTotal, locale)}</span>
                </p>
                <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-muted-foreground">订单金额</span>
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

/** 顶部订单信息条：时间 · 订单号（不截断）· 店铺 | 右侧 倒计时 + 状态 + 订单详情按钮 */
function OrderCardHeader({
    order,
    seconds,
    onDetail,
}: {
    order: Order
    /** 待付款倒计时秒数；其余状态 undefined（不显示） */
    seconds: number | undefined
    onDetail: (() => void) | undefined
}) {
    const { locale } = useI18n()
    const statusMeta = ORDER_CARD_STATUS_META[order.status]
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
                        {order.shopName ?? "店铺已关闭"}
                    </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                        下单时间：{formatDateTime(order.createdAt, locale)}
                    </span>
                    <span className="min-w-0 wrap-anywhere">订单号：{order.orderNo}</span>
                </div>
            </div>

            <div className="ms-auto flex flex-wrap items-center gap-4">
                {seconds !== undefined && (
                    <span className="text-xs font-medium text-destructive tabular-nums">
                        剩 {formatCountdown(seconds)}
                    </span>
                )}
                <Badge variant={statusMeta.tone}>{ORDER_STATUS_LABEL[order.status]}</Badge>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDetail?.()}
                >
                    订单详情
                    <ChevronRight
                        aria-hidden="true"
                        data-icon="inline-end"
                    />
                </Button>
            </div>
        </PanelHeader>
    )
}

/** 订单项一行：主图 · 标题 · 成交单价（含划线原价）· 行小计 */
function OrderCardItem({ item }: { item: OrderItem }) {
    const { locale } = useI18n()
    return (
        <Item
            size="lg"
            variant="plain"
        >
            <div className="flex min-w-0 flex-1 basis-full items-center gap-3 @2xl/order:basis-0">
                {/* 主图 */}
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

                {/* 描述：标题 */}
                <ItemContent className="min-w-0">
                    <ItemTitle
                        lines={2}
                        className="w-full wrap-anywhere"
                    >
                        {item.title}
                    </ItemTitle>
                    <ItemDescription lines={1}>购买数量：{item.quantity} 件</ItemDescription>
                </ItemContent>
            </div>

            {/* 金额：单价 · 划线原价 · 数量 */}
            <div className="ms-auto w-24 shrink-0 space-y-1 text-end tabular-nums">
                <p className="text-xs text-muted-foreground">成交单价</p>
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

            {/* 行小计 */}
            <div className="w-28 shrink-0 text-end">
                <p className="text-sm font-bold text-foreground">
                    小计{" "}
                    <Price
                        value={item.amount}
                        className="text-sm text-foreground"
                    />
                </p>
            </div>
        </Item>
    )
}

/** 订单状态提示行：待发货单优先报发货时限（过点不由系统代关单，只把「你可以取消退款」摆到买家眼前，ORD-27），
 *  其余状态用状态自己的 hint */
function OrderCardHint({ order }: { order: Order }) {
    const { locale } = useI18n()
    const shipDeadline = order.status === "pending_shipment" ? order.shipExpireAt : undefined
    if (!shipDeadline)
        return (
            <p className="text-xs text-muted-foreground">
                {ORDER_CARD_STATUS_META[order.status].hint}
            </p>
        )
    const overdue = isShipOverdue({ shipExpireAt: shipDeadline })
    return (
        <p
            className={
                overdue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"
            }
        >
            {overdue
                ? `商家已超过发货时限（${formatDateTime(shipDeadline, locale)}），可取消订单并退款`
                : `商家需在 ${formatDateTime(shipDeadline, locale)} 前发货`}
        </p>
    )
}
