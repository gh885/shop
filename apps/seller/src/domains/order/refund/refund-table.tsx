import type { CaseView } from "@shop/api/sdk"
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
import { formatMoney, money } from "@shop/common/domain"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { RMA_STATUS_META, RMA_TYPE_LABEL } from "#/domains/order/constants"
import { isRmaStatus, isRmaType } from "#/domains/order/rules"
import { rmaRowActions, type RmaRowAction } from "#/domains/order/refund/mapper"
import { RMA_ACTION_LABEL } from "#/domains/order/refund/constants"
import { CopyableText } from "#/shared/ui/CopyableText"

export interface RmaTableProps {
    rows: CaseView[]
    nextCursor?: string
    /** 正在处理的售后单 id：该行按钮禁用防重复提交 */
    busyId?: string
    onLoadMore: () => void
    /** 行内动作：售后单 id 判忙、单号进文案 */
    onAction: (rma: RmaRowIdentity, action: RmaRowAction) => void
}

export type RmaRowIdentity = Pick<CaseView, "id" | "caseNo">

const rowIdentity = (rma: CaseView): RmaRowIdentity => ({ id: rma.id, caseNo: rma.caseNo })

export function RmaTable({ rows, nextCursor, busyId, onLoadMore, onAction }: RmaTableProps) {
    const { locale } = useI18n()
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
                        <TableHead>{t("order.refund.header.ticket")}</TableHead>
                        <TableHead>{t("order.refund.header.orderNo")}</TableHead>
                        <TableHead className="text-right">
                            {t("order.refund.header.refundAmount")}
                        </TableHead>
                        <TableHead className="min-w-40">
                            {t("order.refund.header.reason")}
                        </TableHead>
                        <TableHead className="min-w-36">
                            {t("order.refund.header.appliedAt")}
                        </TableHead>
                        <TableHead className="text-right">
                            {t("order.refund.header.action")}
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((rma) => {
                        const statusMeta = isRmaStatus(rma.status)
                            ? RMA_STATUS_META[rma.status]
                            : undefined
                        const typeLabel = isRmaType(rma.type) ? RMA_TYPE_LABEL[rma.type] : undefined
                        return (
                            <TableRow key={rma.id}>
                                <TableCell>
                                    <div className="flex flex-col items-start gap-1">
                                        <Badge variant="outline">
                                            {typeLabel ? t(typeLabel) : rma.type}
                                        </Badge>
                                        {statusMeta ? (
                                            <Badge variant={statusMeta.variant}>
                                                {t(statusMeta.labelKey)}
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">{rma.status}</Badge>
                                        )}
                                    </div>
                                </TableCell>

                                <TableCell>
                                    <CopyableText
                                        value={rma.caseNo}
                                        label={t("order.refund.header.ticket")}
                                        className="tabular-nums"
                                    />
                                </TableCell>

                                <TableCell className="text-right tabular-nums">
                                    {formatMoney(money(rma.refundAmount, rma.currency), locale)}
                                </TableCell>

                                <TableCell>
                                    <span className="line-clamp-2 max-w-60 whitespace-normal text-muted-foreground">
                                        {rma.reasonCode}
                                    </span>
                                </TableCell>

                                <TableCell
                                    variant="muted"
                                    className="tabular-nums"
                                >
                                    {formatDateTime(rma.createdAt, locale)}
                                </TableCell>

                                <TableCell className="text-right">
                                    <RowActions
                                        rma={rma}
                                        busy={busyId === rma.id}
                                        onAction={(action) => onAction(rowIdentity(rma), action)}
                                    />
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </TableShell>
    )
}

function RowActions({
    rma,
    busy,
    onAction,
}: {
    rma: CaseView
    busy: boolean
    onAction: (action: RmaRowAction) => void
}) {
    const t = useT()
    const actions = rmaRowActions(rma)
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
                    {t(RMA_ACTION_LABEL[action])}
                </Button>
            ))}
        </div>
    )
}
