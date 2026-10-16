import type { ReactNode } from "react"

import { Badge, Button, Panel, PanelContent, PanelHeader, Spinner } from "@shop/ui-web"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"

import type { TicketResponse } from "@shop/api/sdk"

import { TICKET_STATUS_TONE } from "./constants"
import {
    AFTER_SALE_REASON_UNSET_KEY,
    afterSaleActionLabel,
    afterSaleReasonLabel,
    afterSaleTypeLabel,
    ticketStatusLabel,
} from "./order-label"
import { buyerAfterSaleActions, type AfterSaleAction } from "./after-sale"

export interface AfterSaleCardProps {
    ticket: TicketResponse
    onAction?: (action: AfterSaleAction) => void
    pendingAction?: AfterSaleAction
}

export function AfterSaleCard({ ticket, onAction, pendingAction }: AfterSaleCardProps) {
    const { locale } = useI18n()
    const t = useT()
    const actions = buyerAfterSaleActions(ticket)
    const actionLabel = (action: AfterSaleAction) =>
        action === "return" && ticket.returnTrackingNo
            ? t("order.afterSale.action.editReturn")
            : afterSaleActionLabel(action, t)

    return (
        <Panel>
            <PanelHeader>
                <span className="text-sm font-medium text-foreground">
                    {t("order.afterSale.card.title")}
                </span>
                <Badge variant="outline">{afterSaleTypeLabel(ticket.type, t)}</Badge>
                <Badge variant={TICKET_STATUS_TONE[ticket.status]}>
                    {ticketStatusLabel(ticket.status, t)}
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
                    {ticket.refundAmount ? (
                        <Price
                            value={ticket.refundAmount}
                            className="text-sm text-primary-subtle-foreground"
                        />
                    ) : (
                        "—"
                    )}
                </Row>

                <Row label={t("order.afterSale.card.reason")}>
                    {ticket.reasonCode
                        ? afterSaleReasonLabel(ticket.reasonCode, t)
                        : t(AFTER_SALE_REASON_UNSET_KEY)}
                </Row>

                <Row label={t("order.afterSale.card.note")}>
                    {ticket.reason ?? t("order.afterSale.card.noteEmpty")}
                </Row>

                {ticket.noReasonEnforced && (
                    <Row label={t("order.afterSale.card.noReasonEnforced.label")}>
                        {t("order.afterSale.card.noReasonEnforced.body")}
                    </Row>
                )}

                {ticket.rejectReason && (
                    <Row label={t("order.afterSale.card.rejectReason")}>{ticket.rejectReason}</Row>
                )}

                <Row label={t("order.afterSale.card.appliedAt")}>
                    {formatDateTime(ticket.createdAt, locale)}
                </Row>

                {actions.includes("return") && (
                    <Row label={t("order.afterSale.card.returnAddress")}>
                        {ticket.returnAddress ?? t("order.afterSale.card.returnAddressMissing")}
                    </Row>
                )}

                {ticket.refundedAt && (
                    <Row label={t("order.afterSale.card.refundedAt")}>
                        {formatDateTime(ticket.refundedAt, locale)}
                    </Row>
                )}

                {ticket.returnTrackingNo && (
                    <Row label={t("order.afterSale.action.return")}>
                        {ticket.returnLogisticsCompany ?? t("order.afterSale.card.returnCarrier")}{" "}
                        {ticket.returnTrackingNo}
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
