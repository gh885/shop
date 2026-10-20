import type { SellerRefundItemResponse } from "@shop/api/sdk"
import { Badge, Button, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shop/ui-web"
import { formatMoney } from "@shop/common/domain"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import {
    REFUND_STATUS_META,
    REFUND_TYPE_LABEL,
    TICKET_REASON_LABEL,
} from "#/domains/order/constants"
import { refundRowActions } from "#/domains/order/refund/mapper"
import { REFUND_ACTION_LABEL } from "#/domains/order/refund/constants"
import type { RefundRowAction } from "#/domains/order/refund/mapper"
import { CopyableText } from "#/shared/ui/CopyableText"
import { TableCard } from "#/shared/ui/TableCard"

export interface RefundTableProps {
    rows: SellerRefundItemResponse[]
    page: number
    pageSize: number
    total: number
    /** 正在处理的退款单 id：该行按钮禁用防重复提交 */
    busyId?: string
    onPageChange: (page: number) => void
    /** 行内动作：退款单 id 判忙 / 订单 id 走请求 / 单号进文案（三个 id 各归其位，别让表格猜） */
    onAction: (refund: RefundRowIdentity, action: RefundRowAction) => void
}

export type RefundRowIdentity = Pick<SellerRefundItemResponse, "id" | "orderId" | "orderNo">

const rowIdentity = (refund: SellerRefundItemResponse): RefundRowIdentity => ({
    id: refund.id,
    orderId: refund.orderId,
    orderNo: refund.orderNo,
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
                {rows.map((refund) => (
                    <TableRow key={refund.id}>
                        <TableCell>
                            <div className="flex flex-col items-start gap-1">
                                <Badge variant="outline">{t(REFUND_TYPE_LABEL[refund.type])}</Badge>
                                <Badge variant={REFUND_STATUS_META[refund.status].variant}>
                                    {t(REFUND_STATUS_META[refund.status].labelKey)}
                                </Badge>
                            </div>
                        </TableCell>

                        <TableCell>
                            <p className="max-w-56 truncate font-medium">{refund.firstItemName}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {t("order.refund.items.total", { count: refund.itemCount })}
                            </p>
                        </TableCell>

                        <TableCell>
                            <CopyableText
                                value={refund.orderNo}
                                label={t("order.refund.header.orderNo")}
                                className="tabular-nums"
                            />
                        </TableCell>

                        <TableCell>{refund.receiverName}</TableCell>

                        <TableCell className="text-right tabular-nums">
                            {formatMoney(refund.amount, locale)}
                        </TableCell>

                        <TableCell>
                            <div className="flex flex-col items-start gap-1">
                                {refund.reasonCode && (
                                    <Badge
                                        variant={refund.noReasonEnforced ? "warning" : "outline"}
                                    >
                                        {t(TICKET_REASON_LABEL[refund.reasonCode])}
                                    </Badge>
                                )}
                                <span className="line-clamp-2 max-w-60 whitespace-normal text-muted-foreground">
                                    {refund.reason ?? t("order.refund.noNote")}
                                </span>
                                {/* 强制受理是后端在申请那一刻定下的结论（AFS-45）：不下发「拒绝」得说清为什么 */}
                                {refund.noReasonEnforced && refund.status === "PENDING" && (
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
                            {formatDateTime(refund.createdAt, locale)}
                        </TableCell>

                        <TableCell className="text-right">
                            <RowActions
                                refund={refund}
                                busy={busyId === refund.id}
                                onAction={(action) => onAction(rowIdentity(refund), action)}
                            />
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </TableCard>
    )
}

function RowActions({
    refund,
    busy,
    onAction,
}: {
    refund: SellerRefundItemResponse
    busy: boolean
    onAction: (action: RefundRowAction) => void
}) {
    const t = useT()
    const actions = refundRowActions(refund)
    if (actions.length === 0) {
        return <span className="text-xs text-muted-foreground">{t("order.refund.handled")}</span>
    }
    return (
        <div className="flex items-center justify-end gap-1">
            {actions.map((action) => (
                <Button
                    key={action}
                    variant={action === "reject" || action === "intercept" ? "ghost" : "outline"}
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
