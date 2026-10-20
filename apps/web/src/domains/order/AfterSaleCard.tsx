import type { ReactNode } from "react"

import { Badge, Button, Panel, PanelContent, PanelHeader, Spinner } from "@shop/ui-web"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { formatMoney } from "@shop/common/domain"
import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"

import type { RefundResponse } from "@shop/api/sdk"

import { REFUND_STATUS_TONE } from "./constants"
import {
    AFTER_SALE_REASON_UNSET_KEY,
    afterSaleActionLabel,
    afterSaleReasonLabel,
    afterSaleTypeLabel,
    refundLineTypeLabel,
    refundStatusLabel,
} from "./order-label"
import { buyerAfterSaleActions, type AfterSaleAction } from "./after-sale"

export interface AfterSaleCardProps {
    refund: RefundResponse
    onAction?: (action: AfterSaleAction) => void
    pendingAction?: AfterSaleAction
}

/**
 * 买家退款卡：一张退款单（行级），展示「退的哪几行、多少钱、走到哪一步」。
 *
 * <p>行明细是这张卡与旧售后卡最大的区别：退款按订单行退，总额只是行金额之和 + 整单退满时的运费；
 * 买家要能对上「我退了哪几件」。
 */
export function AfterSaleCard({ refund, onAction, pendingAction }: AfterSaleCardProps) {
    const { locale } = useI18n()
    const t = useT()
    const actions = buyerAfterSaleActions(refund)
    const actionLabel = (action: AfterSaleAction) =>
        action === "return" && refund.returnTrackingNo
            ? t("order.afterSale.action.editReturn")
            : afterSaleActionLabel(action, t)

    return (
        <Panel>
            <PanelHeader>
                <span className="text-sm font-medium text-foreground">
                    {t("order.afterSale.card.title")}
                </span>
                <Badge variant="outline">{afterSaleTypeLabel(refund.type, t)}</Badge>
                <Badge variant={REFUND_STATUS_TONE[refund.status]}>
                    {refundStatusLabel(refund.status, t)}
                </Badge>

                <div className="ml-auto flex items-center gap-2">
                    {actions.map((action) => (
                        <Button
                            key={action}
                            variant={action === "return" ? "default" : "outline"}
                            size="sm"
                            disabled={pendingAction === action}
                            onClick={() => onAction?.(action)}
                        >
                            {pendingAction === action && <Spinner />}
                            {actionLabel(action)}
                        </Button>
                    ))}
                </div>
            </PanelHeader>

            <PanelContent>
                <Row label={t("order.afterSale.card.refundAmount")}>
                    <Price
                        value={refund.amount}
                        className="text-sm text-primary-subtle-foreground"
                    />
                </Row>

                <Row label={t("order.afterSale.card.lines")}>
                    <ul className="space-y-1">
                        {refund.lines.map((line) => (
                            <li
                                key={`${line.lineType}-${line.orderItemId ?? "extra"}`}
                                className="flex items-center justify-between gap-3"
                            >
                                <span className="min-w-0 truncate">
                                    {line.name ?? refundLineTypeLabel(line.lineType, t)}
                                    {line.quantity === null ? "" : ` × ${line.quantity}`}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                    {formatMoney(line.amount, locale)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Row>

                <Row label={t("order.afterSale.card.reason")}>
                    {refund.reasonCode
                        ? afterSaleReasonLabel(refund.reasonCode, t)
                        : t(AFTER_SALE_REASON_UNSET_KEY)}
                </Row>

                <Row label={t("order.afterSale.card.note")}>
                    {refund.reason ?? t("order.afterSale.card.noteEmpty")}
                </Row>

                {refund.noReasonEnforced && (
                    <Row label={t("order.afterSale.card.noReasonEnforced.label")}>
                        {t("order.afterSale.card.noReasonEnforced.body")}
                    </Row>
                )}

                {refund.rejectReason && (
                    <Row label={t("order.afterSale.card.rejectReason")}>{refund.rejectReason}</Row>
                )}

                <Row label={t("order.afterSale.card.appliedAt")}>
                    {formatDateTime(refund.createdAt, locale)}
                </Row>

                {actions.includes("return") && (
                    <Row label={t("order.afterSale.card.returnAddress")}>
                        {refund.returnAddress ?? t("order.afterSale.card.returnAddressMissing")}
                    </Row>
                )}

                {refund.succeededAt && (
                    <Row label={t("order.afterSale.card.refundedAt")}>
                        {formatDateTime(refund.succeededAt, locale)}
                    </Row>
                )}

                {refund.returnTrackingNo && (
                    <Row label={t("order.afterSale.action.return")}>
                        {refund.returnCarrierName ?? t("order.afterSale.card.returnCarrier")}{" "}
                        {refund.returnTrackingNo}
                    </Row>
                )}
            </PanelContent>
        </Panel>
    )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center gap-4 px-5 py-3 text-sm">
            <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
            <span className="min-w-0 flex-1 text-foreground">{children}</span>
        </div>
    )
}
