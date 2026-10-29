import {
    Badge,
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableShell,
} from "@shop/ui-web"
import { formatMoney } from "@shop/common/domain"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import type { SellerOrderSummary } from "@shop/api/sdk"

import { CopyableText } from "#/shared/ui/CopyableText"

import { ORDER_STATUS_META } from "#/domains/order/constants"

interface OrderTableProps {
    rows: SellerOrderSummary[]
    nextCursor?: string
    /** 单个订单正在执行的动作（如发货中）：禁用该行按钮 */
    busyId?: string
    onLoadMore: () => void
    onShip: (order: OrderIdentity) => void
    onRevealPhone: (order: OrderIdentity) => void
    /** 正在取明文的订单 id：那一行禁用「查看」，连点不多刷取用留痕 */
    revealingId?: string
    /** 逐单取回的明文电话：列表摘要本身不带收件人 */
    phones: Readonly<Record<string, string>>
}

/** 弹窗的操作对象：列表只给摘要，行级数量要按 id 拉详情 */
export type OrderIdentity = Pick<SellerOrderSummary, "sellerOrderId" | "orderNo">

export function OrderTable({
    rows,
    nextCursor,
    busyId,
    onLoadMore,
    onShip,
    onRevealPhone,
    revealingId,
    phones,
}: OrderTableProps) {
    const t = useT()
    return (
        <TableShell
            footer={
                nextCursor ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onLoadMore}
                    >
                        {t("order.list.loadMore")}
                    </Button>
                ) : undefined
            }
        >
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("order.list.header.orderNo")}</TableHead>
                        <TableHead className="text-right">
                            {t("order.list.header.payAmount")}
                        </TableHead>
                        <TableHead>{t("order.list.header.status")}</TableHead>
                        <TableHead className="min-w-36">
                            {t("order.list.header.createdAt")}
                        </TableHead>
                        <TableHead className="text-right">
                            {t("order.list.header.action")}
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((o) => (
                        <OrderRow
                            key={o.sellerOrderId}
                            order={o}
                            busy={o.sellerOrderId === busyId}
                            phone={phones[o.sellerOrderId]}
                            onShip={() => onShip(orderIdentity(o))}
                            onRevealPhone={() => onRevealPhone(orderIdentity(o))}
                            revealingPhone={o.sellerOrderId === revealingId}
                        />
                    ))}
                </TableBody>
            </Table>
        </TableShell>
    )
}

const orderIdentity = (o: SellerOrderSummary): OrderIdentity => ({
    sellerOrderId: o.sellerOrderId,
    orderNo: o.orderNo,
})

// 摘要行不带收件人：明文按需逐单索取且留痕，拿到的写进 phones 表（缓存里不存明文）
function OrderRow({
    order: o,
    busy,
    phone,
    onShip,
    onRevealPhone,
    revealingPhone,
}: {
    order: SellerOrderSummary
    busy: boolean
    phone: string | undefined
    onShip: () => void
    onRevealPhone: () => void
    revealingPhone: boolean
}) {
    const statusMeta = ORDER_STATUS_META[o.status as keyof typeof ORDER_STATUS_META]
    const { locale } = useI18n()
    const t = useT()
    // 待发货与部分发货都能继续发货：后端按剩余量裁决，前端不在这里另算
    const canShip =
        o.fulfillmentStatus === "awaiting_shipment" || o.fulfillmentStatus === "partially_shipped"

    return (
        <TableRow>
            <TableCell>
                <CopyableText
                    value={o.orderNo}
                    label={t("order.list.header.orderNo")}
                    className="font-medium tabular-nums"
                />
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {formatMoney(o.payableAmount, locale)}
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                    {statusMeta ? (
                        <Badge variant={statusMeta.variant}>{t(statusMeta.labelKey)}</Badge>
                    ) : (
                        <Badge variant="secondary">{o.status}</Badge>
                    )}
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
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={revealingPhone}
                        onClick={onRevealPhone}
                    >
                        {phone ?? t("order.list.action.revealPhone")}
                    </Button>
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
                </div>
            </TableCell>
        </TableRow>
    )
}
