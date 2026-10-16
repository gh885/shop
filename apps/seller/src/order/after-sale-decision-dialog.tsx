import type { ReactNode } from "react"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"
import type { TicketResponse } from "@shop/api/sdk"
import { formatMoney, NOTE_MAX } from "@shop/common/domain"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import type { SellerMessageKey } from "#/locales/messages.gen"
import { ReasonForm } from "@shop/app-kit/forms"
import {
    Alert,
    AlertDescription,
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shop/ui-web"

import {
    DECISION_TITLE,
    describeDecision,
    NO_RETURN_TRACKING_KEY,
    RETURN_CARRIER_FALLBACK_KEY,
    returnShipmentText,
    type SaleDecisionKind,
} from "#/order/after-sale-decision"
import { TICKET_REASON_LABEL, TICKET_STATUS_META, TICKET_TYPE_LABEL } from "#/order/constants"
import { shopAfterSaleOptions } from "#/order/queries"

// 按 orderId 重取当前售后单：列表行可能是几分钟前的缓存，决策不能拿旧数据判
type TicketData = TicketResponse | null

type DecisionRowKey = Extract<SellerMessageKey, `order.decision.row.${string}`>

export function AfterSaleDecisionDialog({
    open,
    onOpenChange,
    kind,
    orderId,
    orderNo,
    shopId,
    onConfirm,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    kind: SaleDecisionKind
    orderId?: string
    orderNo?: string
    shopId: string
    /** 拒绝收必填理由文本，其余动作忽略；返回 promise 时失败不关窗（见 confirmReject） */
    onConfirm: (reason: string) => void | Promise<unknown>
}) {
    const t = useT()
    const ticket = useQuery(shopAfterSaleOptions(shopId, open ? orderId : undefined))
    const data = ticket.data
    const cancel = () => onOpenChange(false)
    const confirmAndClose = (reason: string) => {
        void onConfirm(reason)
        cancel()
    }
    // 拒绝等 onConfirm 结果再关窗：先关窗会卸载 ReasonForm，422 的字段级明细落不到框上
    const confirmReject = async (reason: string) => {
        await onConfirm(reason)
        cancel()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t(DECISION_TITLE[kind])}</DialogTitle>
                    <DialogDescription>{t(describeDecision(kind, data))}</DialogDescription>
                </DialogHeader>

                <TicketFacts
                    ticket={ticket}
                    orderNo={orderNo}
                />

                {kind === "reject" ? (
                    <ReasonForm
                        maxLength={NOTE_MAX}
                        label={t("order.decision.reason.label")}
                        placeholder={t("order.decision.reason.placeholder")}
                        submitLabel={t("order.decision.reason.submit")}
                        onCancel={cancel}
                        onSubmit={confirmReject}
                    />
                ) : (
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={cancel}
                        >
                            {t("confirm.cancel")}
                        </Button>
                        <Button onClick={() => confirmAndClose("")}>
                            {kind === "agree"
                                ? t("order.decision.confirmAgree")
                                : t("order.decision.confirmReceive")}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}

// oxlint-disable-next-line react-doctor/no-high-complexity-react-function -- 售后单事实区四态（读取中/失败/详情/无单）+ 类型相关行是刻意结构，已从决策主组件分离；拆分需传 6+ props 的宽接口
function TicketFacts({
    ticket,
    orderNo,
}: {
    ticket: UseQueryResult<TicketData>
    orderNo?: string
}) {
    const { locale } = useI18n()
    const t = useT()
    const data = ticket.data
    return (
        <div className="mt-2 space-y-3 text-sm">
            <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t("order.decision.row.orderNo")}</span>
                <span className="font-medium tabular-nums">{orderNo}</span>
                {data && (
                    <Badge variant="outline">{t(TICKET_STATUS_META[data.status].labelKey)}</Badge>
                )}
            </div>

            {ticket.isPending ? (
                <p className="text-muted-foreground">{t("order.decision.loading")}</p>
            ) : ticket.isError ? (
                <Alert variant="destructive">
                    <CircleAlert />
                    <AlertDescription>{t("order.decision.loadFailed")}</AlertDescription>
                </Alert>
            ) : data ? (
                <dl className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <Row labelKey="order.decision.row.type">
                        <Badge variant={data.type === "RETURN_REFUND" ? "warning" : "info"}>
                            {t(TICKET_TYPE_LABEL[data.type])}
                        </Badge>
                    </Row>
                    <Row labelKey="order.decision.row.refundAmount">
                        {formatMoney(data.refundAmount, locale)}
                        <span className="ml-1 text-xs text-muted-foreground">
                            {t("order.decision.wholePaidSuffix")}
                        </span>
                    </Row>
                    <Row labelKey="order.decision.row.reason">
                        <span className="flex flex-wrap items-center gap-2">
                            {/* 历史单没有原因枚举，不补编一个原因给卖家看 */}
                            {data.reasonCode
                                ? t(TICKET_REASON_LABEL[data.reasonCode])
                                : t("order.reason.none")}
                            {/* 强制受理少了「拒绝」按钮得给说法，否则卖家以为界面坏了 */}
                            {data.noReasonEnforced && data.status === "APPLYING" && (
                                <Badge variant="warning">
                                    {t("order.decision.sevenDayNoReject")}
                                </Badge>
                            )}
                        </span>
                    </Row>
                    <Row labelKey="order.decision.row.note">
                        {data.reason ?? t("order.decision.noBuyerNote")}
                    </Row>
                    {/* 退货物流按态给而不按动作给：确认收货要核对单号，拒绝寄回件同样得先看清寄的是哪一单 */}
                    {data.status === "RETURNING" && (
                        <Row labelKey="order.decision.row.returnShipment">
                            {returnShipmentText(
                                data,
                                t(RETURN_CARRIER_FALLBACK_KEY),
                                t(NO_RETURN_TRACKING_KEY),
                            )}
                        </Row>
                    )}
                </dl>
            ) : (
                <Alert variant="warning">
                    <CircleAlert />
                    <AlertDescription>{t("order.decision.notFound")}</AlertDescription>
                </Alert>
            )}
        </div>
    )
}

function Row({ labelKey, children }: { labelKey: DecisionRowKey; children: ReactNode }) {
    const t = useT()
    return (
        <div className="flex items-start gap-3">
            <dt className="w-20 shrink-0 text-muted-foreground">{t(labelKey)}</dt>
            <dd className="min-w-0 flex-1">{children}</dd>
        </div>
    )
}
