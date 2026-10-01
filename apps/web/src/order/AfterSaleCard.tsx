import type { ReactNode } from "react"

import { Badge, Button, Panel, PanelContent, PanelHeader, Spinner } from "@shop/ui-web"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { Price } from "#/shared/ui/Price"

import type { TicketResponse } from "@shop/api/sdk"

import {
    AFTER_SALE_ACTION_LABEL,
    AFTER_SALE_REASON_LABEL,
    AFTER_SALE_TYPE_LABEL,
    TICKET_STATUS_META,
} from "./constants"
import { buyerAfterSaleActions, type AfterSaleAction } from "./after-sale"

/**
 * 售后卡：订单详情里那张「这单售后到哪一步了」的卡片。
 *
 * 纯展示 + 回调：状态从售后单自身读出，操作按钮吃后端下发的 availableActions
 * （经 buyerAfterSaleActions 投影成 UI 动作，C5b）——
 * 卡片不认识订单状态，也不自己发请求（弹窗与 mutation 都归页面持有）。
 * 时间线不做完整历史（后端 ticket_events 没开接口）：只把「当前状态 + 关键时刻」讲清楚，
 * 免得前端凭当前状态编造一条看似权威的轨迹。唯一的例外是拒绝理由——那是后端从时间线读出来随详情
 * 下发的一行（AFS-44），卡片照抄，不自己推。
 *
 * 回寄引导区（RETURNING 待寄回时才有）：退货地址随详情下发（returnAddress，查询时实时解析的卖家默认
 * 退货地址）；null 时不编地址，直说「联系客服」——寄错地方比少一步引导糟糕得多。
 */

export interface AfterSaleCardProps {
    ticket: TicketResponse
    onAction?: (action: AfterSaleAction) => void
    /** 进行中的操作：对应按钮禁用，防重复提交 */
    pendingAction?: AfterSaleAction
}

export function AfterSaleCard({ ticket, onAction, pendingAction }: AfterSaleCardProps) {
    const { locale } = useI18n()
    const actions = buyerAfterSaleActions(ticket)
    // 已填过运单号：按钮改叫「修改」，避免买家以为自己还没填
    const actionLabel = (action: AfterSaleAction) =>
        action === "return" && ticket.returnTrackingNo
            ? "修改退货物流"
            : AFTER_SALE_ACTION_LABEL[action]

    return (
        <Panel>
            <PanelHeader>
                <span className="text-sm font-medium text-foreground">售后</span>
                <Badge variant="outline">{AFTER_SALE_TYPE_LABEL[ticket.type]}</Badge>
                <Badge variant={TICKET_STATUS_META[ticket.status].tone}>
                    {TICKET_STATUS_META[ticket.status].label}
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
                            value={ticket.refundAmount}
                            className="text-sm text-primary-subtle-foreground"
                        />
                    ) : (
                        "—"
                    )}
                </Row>

                <Row label="售后原因">
                    {/* 历史单没有原因枚举（改动前只有自由文本），不替它编一个原因 */}
                    {ticket.reasonCode ? AFTER_SALE_REASON_LABEL[ticket.reasonCode] : "未选择"}
                </Row>

                <Row label="补充说明">{ticket.reason ?? "买家未填写"}</Row>

                {/* 强制受理是后端在申请那一刻算定并随单下发的结论（AFS-45），卡片照抄不自己推日期 */}
                {ticket.noReasonEnforced && (
                    <Row label="无理由保障">收货七天内无理由退货，卖家不可拒绝受理</Row>
                )}

                {/* 被拒才有这一行：卖家的理由取自时间线那行 note（AFS-44），买家据此决定补什么再来、还是另行协商 */}
                {ticket.rejectReason && <Row label="拒绝理由">{ticket.rejectReason}</Row>}

                <Row label="申请时间">{formatDateTime(ticket.createdAt, locale)}</Row>

                {/* 回寄引导区：待寄回（RETURN_GOODS 下发，含已填过单号可改单的情况）才给地址 */}
                {actions.includes("return") && (
                    <Row label="退货地址">
                        {ticket.returnAddress ?? "卖家未设置退货地址，请先联系客服"}
                    </Row>
                )}

                {ticket.refundedAt && (
                    <Row label="退款时间">{formatDateTime(ticket.refundedAt, locale)}</Row>
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
