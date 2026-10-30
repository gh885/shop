import type { ReactNode } from "react"

import { Badge, Button, Panel, PanelContent, PanelHeader, Spinner } from "@shop/ui-web"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"

import type { CaseView } from "@shop/api/sdk"

import { CASE_STATUS_TONE } from "./constants"
import {
    afterSaleActionLabel,
    afterSaleReasonLabel,
    afterSaleTypeLabel,
    caseStatusLabel,
} from "./order-label"
import { buyerAfterSaleActions, isCaseStatus, type AfterSaleAction } from "./after-sale"

export interface AfterSaleCardProps {
    refund: CaseView
    onAction?: (action: AfterSaleAction) => void
    pendingAction?: AfterSaleAction
}

/**
 * 买家售后卡：一张售后单，展示「类型、状态、退多少钱、什么时候申请」。
 *
 * <p>新契约的 `CaseView` 不带物流单号、驳回理由、退款成功时间——这些字段后端还没有，
 * 卡片就照实不显示，不拿空值占位。
 */
export function AfterSaleCard({ refund, onAction, pendingAction }: AfterSaleCardProps) {
    const { locale } = useI18n()
    const t = useT()
    const actions = buyerAfterSaleActions(refund)

    return (
        <Panel>
            <PanelHeader>
                <span className="text-sm font-medium text-foreground">
                    {t("order.afterSale.card.title")}
                </span>
                <Badge variant="outline">{afterSaleTypeLabel(refund.type, t)}</Badge>
                <Badge
                    variant={
                        isCaseStatus(refund.status) ? CASE_STATUS_TONE[refund.status] : "outline"
                    }
                >
                    {caseStatusLabel(refund.status, t)}
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
                            {afterSaleActionLabel(action, t)}
                        </Button>
                    ))}
                </div>
            </PanelHeader>

            <PanelContent>
                <Row label={t("order.afterSale.card.refundAmount")}>
                    <Price
                        value={{ amount: refund.refundAmount, currency: refund.currency }}
                        className="text-sm text-primary-subtle-foreground"
                    />
                </Row>

                <Row label={t("order.afterSale.card.lines")}>
                    <ul className="space-y-1">
                        {refund.items.map((line) => (
                            <li
                                key={`${line.orderLineId}-${line.quantity}`}
                                className="flex items-center justify-between gap-3"
                            >
                                <span className="min-w-0 truncate">
                                    {t("order.afterSale.card.quantity", { count: line.quantity })}
                                </span>
                                <span className="shrink-0 tabular-nums">{line.refundAmount}</span>
                            </li>
                        ))}
                    </ul>
                </Row>

                <Row label={t("order.afterSale.card.reason")}>
                    {afterSaleReasonLabel(refund.reasonCode, t)}
                </Row>

                <Row label={t("order.afterSale.card.appliedAt")}>
                    {formatDateTime(refund.createdAt, locale)}
                </Row>
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
