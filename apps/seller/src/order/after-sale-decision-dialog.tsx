import type { ReactNode } from "react"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import type { TicketResponse } from "@shop/api/sdk"
import { formatMoney } from "@shop/common"
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shop/ui-web"

import { TICKET_STATUS_LABEL, TICKET_TYPE_LABEL } from "#/order/constants"
import { shopAfterSaleOptions } from "#/order/queries"

/**
 * 售后决策弹窗（同意 / 拒绝 / 确认收到退货）—— 订单列表与退款售后工作台共用。
 *
 * 为什么不是一句「确定吗」的二次确认：卖家在这里做的是**不可逆的资金决定**——
 * 仅退款点头就退钱，退货退款点头才开始等货；光看列表上一个「售后申请中」徽章就点同意，
 * 等于凭信仰决定。所以弹窗先把售后单本身摊开：类型、买家理由、退款金额（确认收货时再带上退货运单号），
 * 再按类型给出「同意之后会发生什么」。
 *
 * 只收 orderId/orderNo 而不是整行列表数据：工作台那一行虽然也有这些字段，但决策必须基于
 * **当前**的售后单（列表可能是几分钟前拉的），所以这里按 id 重新拉一次，列表数据只用来显示订单号。
 *
 * 售后单拉不到（404 或请求失败）时不拦人：列表徽章已经说明有售后在，卖家可能有别的上下文，
 * 弹窗降级成一句说明 + 照常可确认，而不是把人锁在门外。
 */

export type SaleDecisionKind = "agree" | "reject" | "receive"

const TITLE: Record<SaleDecisionKind, string> = {
    agree: "同意售后",
    reject: "拒绝售后",
    receive: "确认收到退货",
}

type TicketData = TicketResponse | null

/**
 * 一句话说明「点了会怎样」。
 * 同意一线按类型分岔，所以**没拿到售后单就不断言走向**——宁可少说一句，
 * 也不能在「退货退款」的单上写着「商品不寄回」，那正是卖家最容易被误导的一行。
 */
function describeDecision(kind: SaleDecisionKind, data: TicketData | undefined): string {
    if (kind === "reject") return "拒绝后买家仍可在申请窗口内重新提交申请。"
    if (kind === "receive") return "确认后立即退款给买家并回补库存，请先核对退回的包裹。"
    if (!data) return "请先核对售后内容再确认。"
    return data.type === "RETURN_REFUND"
        ? "同意后进入退货流程：买家寄回、你确认收货后才退款并回补库存。"
        : "同意后立即退款给买家，商品不寄回。"
}

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
    onConfirm: () => void
}) {
    // 关着或没有订单就不查：决策弹窗是"按需展开上下文"，不是常驻数据
    const ticket = useQuery(shopAfterSaleOptions(shopId, open ? orderId : undefined))
    const data = ticket.data

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{TITLE[kind]}</DialogTitle>
                    <DialogDescription>{describeDecision(kind, data)}</DialogDescription>
                </DialogHeader>

                <TicketFacts
                    ticket={ticket}
                    kind={kind}
                    orderNo={orderNo}
                />

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        取消
                    </Button>
                    <Button
                        variant={kind === "reject" ? "destructive" : "default"}
                        onClick={() => {
                            onConfirm()
                            onOpenChange(false)
                        }}
                    >
                        {kind === "reject"
                            ? "确认拒绝"
                            : kind === "agree"
                              ? "确认同意"
                              : "确认收货"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * 售后单事实区：订单号徽章 + 四态（读取中 / 失败 / 详情 / 无单）。
 * 拆出来让决策弹窗主体只留「决策骨架」（标题 + 一句话 + 确认/取消），
 * 售后单怎么摊开是独立职责，且这块的条件链不参与主组件复杂度。
 */
// oxlint-disable-next-line react-doctor/no-high-complexity-react-function -- 售后单事实区四态（读取中/失败/详情/无单）+ 类型相关行是刻意结构，已从决策主组件分离；拆分需传 6+ props 的宽接口
function TicketFacts({
    ticket,
    kind,
    orderNo,
}: {
    ticket: UseQueryResult<TicketData>
    kind: SaleDecisionKind
    orderNo?: string
}) {
    const data = ticket.data
    return (
        <div className="mt-2 space-y-3 text-sm">
            <div className="flex items-center gap-2">
                <span className="text-muted-foreground">订单号</span>
                <span className="font-medium tabular-nums">{orderNo}</span>
                {data && <Badge variant="outline">{TICKET_STATUS_LABEL[data.status]}</Badge>}
            </div>

            {ticket.isPending ? (
                <p className="text-muted-foreground">正在读取售后单…</p>
            ) : ticket.isError ? (
                <p className="text-muted-foreground">
                    售后单读取失败，请先与买家确认售后内容再决定。
                </p>
            ) : data ? (
                <dl className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <Row label="售后类型">
                        <Badge variant={data.type === "RETURN_REFUND" ? "warning" : "info"}>
                            {TICKET_TYPE_LABEL[data.type]}
                        </Badge>
                    </Row>
                    <Row label="退款金额">
                        {formatMoney(data.refundAmount)}
                        <span className="ml-1 text-xs text-muted-foreground">（整单实付）</span>
                    </Row>
                    <Row label="买家理由">{data.reason ?? "买家未填写"}</Row>
                    {kind === "receive" && (
                        <Row label="退货物流">
                            {data.returnTrackingNo
                                ? `${data.returnLogisticsCompany ?? "快递"} ${data.returnTrackingNo}`
                                : "买家尚未登记运单号"}
                        </Row>
                    )}
                </dl>
            ) : (
                <p className="text-muted-foreground">没有查到售后单，请谨慎处理。</p>
            )}
        </div>
    )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 flex-1">{children}</dd>
        </div>
    )
}
