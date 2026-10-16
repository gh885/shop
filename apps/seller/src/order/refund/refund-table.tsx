import type { SellerTicketItem } from "@shop/api/sdk"
import { Badge, Button, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shop/ui-web"
import { formatMoney } from "@shop/common/domain"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { TICKET_REASON_LABEL, TICKET_STATUS_META, TICKET_TYPE_LABEL } from "#/order/constants"
import { refundRowActions } from "#/order/refund/mapper"
import { REFUND_ACTION_LABEL, type RefundRowAction } from "#/order/refund/model"
import { CopyableText } from "#/shared/ui/CopyableText"
import { TableCard } from "#/shared/ui/TableCard"

export interface RefundTableProps {
    rows: SellerTicketItem[]
    page: number
    pageSize: number
    total: number
    /** 正在处理的售后单 id：该行按钮禁用防重复提交 */
    busyId?: string
    onPageChange: (page: number) => void
    /** 行内动作：售后单 id 判忙 / 订单 id 走请求 / 单号进文案（三个 id 各归其位，别让表格猜） */
    onAction: (ticket: RefundRowIdentity, action: RefundRowAction) => void
}

export type RefundRowIdentity = Pick<SellerTicketItem, "id" | "orderId" | "orderNo">

const rowIdentity = (ticket: SellerTicketItem): RefundRowIdentity => ({
    id: ticket.id,
    orderId: ticket.orderId,
    orderNo: ticket.orderNo,
})

export function RefundTable({
    rows,
    page,
    pageSize,
    total,
    busyId,
    onPageChange,
    onAction,
}: RefundTableProps) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <TableCard
            total={total}
            unit={t("order.refund.unit")}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead>{t("order.refund.header.ticket")}</TableHead>
                    <TableHead className="min-w-56">{t("order.refund.header.product")}</TableHead>
                    <TableHead>{t("order.refund.header.orderNo")}</TableHead>
                    <TableHead>{t("order.refund.header.buyer")}</TableHead>
                    <TableHead className="text-right">
                        {t("order.refund.header.refundAmount")}
                    </TableHead>
                    <TableHead className="min-w-40">{t("order.refund.header.reason")}</TableHead>
                    <TableHead className="min-w-36">{t("order.refund.header.appliedAt")}</TableHead>
                    <TableHead className="text-right">{t("order.refund.header.action")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((ticket) => (
                    <TableRow key={ticket.id}>
                        <TableCell>
                            <div className="flex flex-col items-start gap-1">
                                <Badge variant="outline">{t(TICKET_TYPE_LABEL[ticket.type])}</Badge>
                                <Badge variant={TICKET_STATUS_META[ticket.status].variant}>
                                    {t(TICKET_STATUS_META[ticket.status].labelKey)}
                                </Badge>
                            </div>
                        </TableCell>

                        <TableCell>
                            <p className="max-w-56 truncate font-medium">{ticket.firstItemName}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {t("order.refund.items.total", { count: ticket.itemCount })}
                            </p>
                        </TableCell>

                        <TableCell>
                            <CopyableText
                                value={ticket.orderNo}
                                label={t("order.refund.header.orderNo")}
                                className="tabular-nums"
                            />
                        </TableCell>

                        <TableCell>{ticket.receiverName}</TableCell>

                        <TableCell className="text-right tabular-nums">
                            {formatMoney(ticket.refundAmount, locale)}
                        </TableCell>

                        <TableCell>
                            <div className="flex flex-col items-start gap-1">
                                {ticket.reasonCode && (
                                    <Badge
                                        variant={ticket.noReasonEnforced ? "warning" : "outline"}
                                    >
                                        {t(TICKET_REASON_LABEL[ticket.reasonCode])}
                                    </Badge>
                                )}
                                <span className="line-clamp-2 max-w-60 whitespace-normal text-muted-foreground">
                                    {ticket.reason ?? t("order.refund.noNote")}
                                </span>
                                {/* 强制受理是后端在申请那一刻定下的结论（AFS-45）：不下发「拒绝」得说清为什么 */}
                                {ticket.noReasonEnforced && ticket.status === "APPLYING" && (
                                    <span className="text-xs text-muted-foreground">
                                        {t("order.refund.sevenDayHint")}
                                    </span>
                                )}
                            </div>
                        </TableCell>

                        <TableCell
                            variant="muted"
                            className="tabular-nums"
                        >
                            {formatDateTime(ticket.createdAt, locale)}
                        </TableCell>

                        <TableCell className="text-right">
                            <RowActions
                                ticket={ticket}
                                busy={busyId === ticket.id}
                                onAction={(action) => onAction(rowIdentity(ticket), action)}
                            />
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </TableCard>
    )
}

function RowActions({
    ticket,
    busy,
    onAction,
}: {
    ticket: SellerTicketItem
    busy: boolean
    onAction: (action: RefundRowAction) => void
}) {
    const t = useT()
    const actions = refundRowActions(ticket)
    if (actions.length === 0) {
        return <span className="text-xs text-muted-foreground">{t("order.refund.handled")}</span>
    }
    return (
        <div className="flex items-center justify-end gap-1">
            {actions.map((action) => (
                <Button
                    key={action}
                    variant={action === "reject" ? "ghost" : "outline"}
                    size="sm"
                    disabled={busy}
                    onClick={() => onAction(action)}
                >
                    {t(REFUND_ACTION_LABEL[action])}
                </Button>
            ))}
        </div>
    )
}
