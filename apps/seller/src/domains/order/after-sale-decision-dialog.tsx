import type { ReactNode } from "react"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"
import type { CaseView } from "@shop/api/sdk"
import { money, NOTE_MAX } from "@shop/common/domain"
import { formatMoney } from "@shop/common/domain"
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

import { decisionFactTag, type SaleDecisionKind } from "#/domains/order/after-sale-decision"
import { isRmaStatus, isRmaType } from "#/domains/order/rules"
import {
    DECISION_CONFIRM_KEY,
    DECISION_DESC_KEY,
    DECISION_TITLE,
    RMA_STATUS_META,
    RMA_TYPE_LABEL,
} from "#/domains/order/constants"
import { rmaDetailOptions } from "#/domains/order/queries"

// 按售后单 id 重取当前状态：列表行可能是几分钟前的缓存，决策不能拿旧数据判
type CaseData = CaseView | null

type DecisionRowKey = Extract<SellerMessageKey, `order.decision.row.${string}`>

export function AfterSaleDecisionDialog({
    open,
    onOpenChange,
    kind,
    caseId,
    orderNo,
    shopId,
    onConfirm,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    kind: SaleDecisionKind
    caseId?: string
    orderNo?: string
    shopId: string
    /** 拒绝收必填理由文本，其余动作忽略；返回 promise 时失败不关窗（见 confirmReject） */
    onConfirm: (reason: string) => void | Promise<unknown>
}) {
    const t = useT()
    const rma = useQuery(rmaDetailOptions(shopId, open ? caseId : undefined))
    const data = rma.data
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
                    <DialogDescription>
                        {t(DECISION_DESC_KEY[decisionFactTag(kind, data)])}
                    </DialogDescription>
                </DialogHeader>

                <CaseFacts
                    rma={rma}
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
                        <Button
                            variant="default"
                            onClick={() => confirmAndClose("")}
                        >
                            {t(DECISION_CONFIRM_KEY[kind])}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}

function CaseFacts({ rma, orderNo }: { rma: UseQueryResult<CaseData>; orderNo?: string }) {
    const { locale } = useI18n()
    const t = useT()
    const data = rma.data
    return (
        <div className="mt-2 space-y-3 text-sm">
            <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t("order.decision.row.orderNo")}</span>
                <span className="font-medium tabular-nums">{orderNo}</span>
                {data && (
                    <Badge variant="outline">
                        {isRmaStatus(data.status)
                            ? t(RMA_STATUS_META[data.status].labelKey)
                            : data.status}
                    </Badge>
                )}
            </div>

            {rma.isPending ? (
                <p className="text-muted-foreground">{t("order.decision.loading")}</p>
            ) : rma.isError ? (
                <Alert variant="destructive">
                    <CircleAlert />
                    <AlertDescription>{t("order.decision.loadFailed")}</AlertDescription>
                </Alert>
            ) : data ? (
                <dl className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <Row labelKey="order.decision.row.type">
                        <Badge variant={data.type === "return_refund" ? "warning" : "info"}>
                            {isRmaType(data.type) ? t(RMA_TYPE_LABEL[data.type]) : data.type}
                        </Badge>
                    </Row>
                    <Row labelKey="order.decision.row.refundAmount">
                        {formatMoney(money(data.refundAmount, data.currency), locale)}
                    </Row>
                    <Row labelKey="order.decision.row.reason">
                        {/* 历史单没有原因枚举，不补编一个原因给卖家看 */}
                        {data.reasonCode || t("order.reason.none")}
                    </Row>
                    <Row labelKey="order.decision.row.caseNo">
                        <span className="tabular-nums">{data.caseNo}</span>
                    </Row>
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
