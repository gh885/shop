import {
    Badge,
    Button,
    Image,
    MaskedValueCell,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"
import { formatMoney } from "@shop/common/domain"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import type { SellerOrderListItemResponse, TicketAvailableAction } from "@shop/api/sdk"
import { useState } from "react"

import { imgUrl } from "#/shared/lib/image"
import { CopyableText } from "#/shared/ui/CopyableText"
import { TableCard } from "#/shared/ui/TableCard"
import { AFTER_SALE_META, ORDER_STATUS_META } from "#/order/constants"
import { refundRowActions } from "#/order/refund/mapper"
import { REFUND_ACTION_LABEL, type RefundRowAction } from "#/order/refund/model"

interface OrderTableProps {
    rows: SellerOrderListItemResponse[]
    page: number
    pageSize: number
    total: number
    /** 单个订单正在执行的动作（如发货中）：禁用该行按钮 */
    busyId?: string
    onPageChange: (page: number) => void
    onShip: (order: OrderIdentity) => void
    /** 售后动作集（后端下发，空集 = 这行没按钮） */
    afterSaleActionsOf: (orderId: string) => TicketAvailableAction[]
    onAfterSaleAction: (order: OrderIdentity, action: RefundRowAction) => void
    /** 买家电话出参只有掩码，明文逐单索取且留痕（ORD-62） */
    onRevealPhone: (order: OrderIdentity) => void
    /** 正在取明文的订单 id：那一行禁用「查看」，连点不多刷取用留痕 */
    revealingId?: string
}

/** 弹窗的操作对象：发货要按行填数量，所以连行项一起交出去（行上带数量与已发/已退） */
export type OrderIdentity = Pick<SellerOrderListItemResponse, "id" | "orderNo" | "items">

export function OrderTable({
    rows,
    page,
    pageSize,
    total,
    busyId,
    onPageChange,
    onShip,
    afterSaleActionsOf,
    onAfterSaleAction,
    onRevealPhone,
    revealingId,
}: OrderTableProps) {
    const t = useT()
    return (
        <TableCard
            total={total}
            unit={t("order.list.unit")}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead className="min-w-64">{t("order.list.header.product")}</TableHead>
                    <TableHead>{t("order.list.header.orderNo")}</TableHead>
                    <TableHead>{t("order.list.header.buyer")}</TableHead>
                    <TableHead className="text-right">{t("order.list.header.payAmount")}</TableHead>
                    <TableHead>{t("order.list.header.status")}</TableHead>
                    <TableHead className="min-w-36">{t("order.list.header.createdAt")}</TableHead>
                    <TableHead className="text-right">{t("order.list.header.action")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((o) => (
                    <OrderRow
                        key={o.id}
                        order={o}
                        busy={o.id === busyId}
                        afterSaleActions={afterSaleActionsOf(o.id)}
                        onShip={() => onShip(orderIdentity(o))}
                        onAfterSaleAction={(action) => onAfterSaleAction(orderIdentity(o), action)}
                        onRevealPhone={() => onRevealPhone(orderIdentity(o))}
                        revealingPhone={o.id === revealingId}
                    />
                ))}
            </TableBody>
        </TableCard>
    )
}

const orderIdentity = (o: SellerOrderListItemResponse): OrderIdentity => ({
    id: o.id,
    orderNo: o.orderNo,
    items: o.items,
})

function ItemsCell({ order }: { order: SellerOrderListItemResponse }) {
    const t = useT()
    const first = order.items[0]
    return (
        <div className="flex items-start gap-3">
            <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                <Image
                    src={imgUrl(first?.image ?? undefined)}
                    alt={first?.name}
                    className="size-full"
                />
            </div>
            <div className="min-w-0 max-w-64 flex-1 space-y-0.5">
                <p
                    className="truncate font-medium"
                    title={first?.name}
                >
                    {first?.name ?? "—"}
                </p>
                {order.itemCount > 1 && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                        {t("order.list.items.total", { count: order.itemCount })}
                    </p>
                )}
            </div>
        </div>
    )
}

// MaskedValueCell 按 value 里还有没有掩码星号段决定给不给入口：明文就地写回这一行缓存，不另立状态
function OrderRow({
    order: o,
    busy,
    afterSaleActions,
    onShip,
    onAfterSaleAction,
    onRevealPhone,
    revealingPhone,
}: {
    order: SellerOrderListItemResponse
    busy: boolean
    afterSaleActions: TicketAvailableAction[]
    onShip: () => void
    onAfterSaleAction: (action: RefundRowAction) => void
    onRevealPhone: () => void
    revealingPhone: boolean
}) {
    const statusMeta = ORDER_STATUS_META[o.status]
    const saleMeta = o.afterSaleStatus === "NONE" ? undefined : AFTER_SALE_META[o.afterSaleStatus]
    const { locale } = useI18n()
    const t = useT()
    const [now] = useState(() => Date.now())
    // 过了发货时限系统不代关单（ORD-60），这里只给一枚催办徽章
    const shipOverdue =
        o.status === "PAID" && o.shipExpireAt !== null && new Date(o.shipExpireAt).getTime() < now
    const canShip = o.availableActions.includes("SHIP")
    const saleRowActions = refundRowActions({ availableActions: afterSaleActions })

    return (
        <TableRow>
            <TableCell>
                <ItemsCell order={o} />
            </TableCell>
            <TableCell>
                <CopyableText
                    value={o.orderNo}
                    label={t("order.list.header.orderNo")}
                    className="font-medium tabular-nums"
                />
            </TableCell>
            <TableCell>
                <div className="space-y-0.5">
                    <p className="truncate font-medium">{o.receiverName}</p>
                    <p className="text-xs text-muted-foreground">
                        <MaskedValueCell
                            value={o.receiverPhone}
                            subject={o.receiverName}
                            revealing={revealingPhone}
                            onReveal={onRevealPhone}
                        />
                    </p>
                </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {formatMoney(o.payAmount, locale)}
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={statusMeta.variant}>{t(statusMeta.labelKey)}</Badge>
                    {shipOverdue && (
                        <Badge variant="warning">{t("order.list.badge.shipOverdue")}</Badge>
                    )}
                    {saleMeta && <Badge variant={saleMeta.variant}>{t(saleMeta.labelKey)}</Badge>}
                </div>
            </TableCell>
            <TableCell
                variant="muted"
                className="tabular-nums"
            >
                {formatDateTime(o.createdAt, locale)}
            </TableCell>

            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    {/* 发货看契约下发的动作集，不按 status 硬推：PAID 首单、SHIPPED 追加包裹都带 SHIP */}
                    {canShip && (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onShip}
                        >
                            {t("order.list.action.ship")}
                        </Button>
                    )}
                    {/* 售后按钮同口径：动作集由 aftersale 批查下发（与工作台同源），不按售后投影另推（ORD-51） */}
                    {saleRowActions.map((action) => (
                        <Button
                            key={action}
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => onAfterSaleAction(action)}
                        >
                            {t(REFUND_ACTION_LABEL[action])}
                        </Button>
                    ))}
                    {!canShip && saleRowActions.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                    )}
                </div>
            </TableCell>
        </TableRow>
    )
}
