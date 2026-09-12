import type { ReactNode } from "react"
import { Badge, Button, Panel, PanelContent, PanelHeader, Spinner } from "@shop/ui-web"
import { formatDateTime } from "@shop/app-kit"

import { Price } from "#/shared/ui/Price"

import {
    AFTER_SALE_TYPE_LABEL,
    TICKET_STATUS_LABEL,
    TICKET_STATUS_TONE,
    buyerAfterSaleActions,
    type AfterSaleAction,
    type AfterSaleTicket,
} from "./after-sale"

/**
 * 售后卡：订单详情里那张「这单售后到哪一步了」的卡片。
 *
 * 纯展示 + 回调：状态从售后单自身读出（见 after-sale.ts），操作按钮由 buyerAfterSaleActions 推导——
 * 卡片不认识订单状态，也不自己发请求（弹窗与 mutation 都归页面持有）。
 * 时间线不做完整历史（后端 ticket_events 没开接口）：只把「当前状态 + 关键时刻」讲清楚，
 * 免得前端凭当前状态编造一条看似权威的轨迹。
 */

const ACTION_LABEL: Record<AfterSaleAction, string> = {
    cancel: "撤销申请",
    return: "填写退货物流",
    track: "查看退货物流",
}

export interface AfterSaleCardProps {
    ticket: AfterSaleTicket
    onAction?: (action: AfterSaleAction) => void
    /** 进行中的操作：对应按钮禁用，防重复提交 */
    pendingAction?: AfterSaleAction
}

export function AfterSaleCard({ ticket, onAction, pendingAction }: AfterSaleCardProps) {
    const actions = buyerAfterSaleActions(ticket)
    // 已填过运单号：按钮改叫「修改」，避免买家以为自己还没填
    const actionLabel = (action: AfterSaleAction) =>
        action === "return" && ticket.returnTrackingNo ? "修改退货物流" : ACTION_LABEL[action]

    return (
        <Panel>
            <PanelHeader>
                <span className="text-sm font-medium text-foreground">售后</span>
                <Badge variant="outline">{AFTER_SALE_TYPE_LABEL[ticket.type]}</Badge>
                <Badge variant={TICKET_STATUS_TONE[ticket.status]}>
                    {TICKET_STATUS_LABEL[ticket.status]}
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
                <Row label="退款金额">
                    {ticket.refundAmount ? (
                        <Price
                            value={ticket.refundAmount.amount}
                            className="text-sm text-primary"
                        />
                    ) : (
                        "—"
                    )}
                </Row>

                <Row label="售后理由">{ticket.reason ?? "买家未填写"}</Row>

                <Row label="申请时间">{formatDateTime(ticket.createdAt)}</Row>

                {ticket.refundedAt && (
                    <Row label="退款时间">{formatDateTime(ticket.refundedAt)}</Row>
                )}

                {ticket.returnTrackingNo && (
                    <Row label="退货物流">
                        {ticket.returnLogisticsCompany ?? "快递"} {ticket.returnTrackingNo}
                    </Row>
                )}
            </PanelContent>
        </Panel>
    )
}

/** 一行「标签 + 值」 */
function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center gap-4 px-5 py-3 text-sm">
            <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
            <span className="min-w-0 flex-1 text-foreground">{children}</span>
        </div>
    )
}
