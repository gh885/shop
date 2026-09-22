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
    useAppForm,
} from "@shop/ui-web"
import { z } from "zod"

import { TICKET_REASON_LABEL, TICKET_STATUS_LABEL, TICKET_TYPE_LABEL } from "#/order/constants"
import { shopAfterSaleOptions } from "#/order/queries"

/**
 * 售后决策弹窗（同意 / 拒绝 / 确认收到退货）—— 订单列表与退款售后工作台共用。
 *
 * 为什么不是一句「确定吗」的二次确认：卖家在这里做的是**不可逆的资金决定**——
 * 仅退款点头就退钱，退货退款点头才开始等货；光看列表上一个「售后申请中」徽章就点同意，
 * 等于凭信仰决定。所以弹窗先把售后单本身摊开：类型、买家理由、退款金额（退货中再带上退货运单号），
 * 再按类型给出「同意之后会发生什么」。拒绝那条路不止摊开上下文，还**收一段必填的理由**（AFS-30）——
 * 拒绝是把买家推到「重新申请或认了」的终局决定，买家看得到理由才谈得上下一步。
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
 * 同意与拒绝的走向都随售后类型 / 当前态分岔，所以**没拿到售后单就不断言走向**——宁可少说一句，
 * 也不能在「退货退款」的单上写着「商品不寄回」，那正是卖家最容易被误导的一行。
 */
function describeDecision(kind: SaleDecisionKind, data: TicketData | undefined): string {
    if (kind === "reject") {
        if (!data) return "请填写拒绝理由后再提交。"
        return data.status === "RETURNING"
            ? "拒绝后这笔退款不会打出、库存也不回补；买家仍可在申请窗口内重新提交申请。"
            : "拒绝后买家仍可在申请窗口内重新提交申请。"
    }
    if (kind === "receive") return "确认后立即退款给买家并回补库存，请先核对退回的包裹。"
    if (!data) return "请先核对售后内容再确认。"
    return data.type === "RETURN_REFUND"
        ? "同意后进入退货流程：买家寄回、你确认收货后才退款并回补库存。"
        : "同意后立即退款给买家，商品不寄回。"
}

/** 拒绝理由：与后端 @NotBlank @Size(max = 200) 同宽（落点是 ticket_events.note 那一列，不给它第二份真相） */
const RejectSchema = z.object({
    reason: z.string().trim().min(1, "请填写拒绝理由").max(200, "拒绝理由最长 200 字"),
})

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
    /** 拒绝这条路收到的是必填的理由文本（AFS-30），其余动作忽略这个入参 */
    onConfirm: (reason: string) => void
}) {
    // 关着或没有订单就不查：决策弹窗是"按需展开上下文"，不是常驻数据
    const ticket = useQuery(shopAfterSaleOptions(shopId, open ? orderId : undefined))
    const data = ticket.data
    const cancel = () => onOpenChange(false)
    const confirm = (reason: string) => {
        onConfirm(reason)
        cancel()
    }

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
                    orderNo={orderNo}
                />

                {/* 拒绝不是一次点击而是一段文本：理由要落进时间线给买家看，空着就发不出去 */}
                {kind === "reject" ? (
                    <RejectReasonForm
                        onCancel={cancel}
                        onSubmit={confirm}
                    />
                ) : (
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={cancel}
                        >
                            取消
                        </Button>
                        <Button onClick={() => confirm("")}>
                            {kind === "agree" ? "确认同意" : "确认收货"}
                        </Button>
                    </DialogFooter>
                )}
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
    orderNo,
}: {
    ticket: UseQueryResult<TicketData>
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
                    <Row label="售后原因">
                        <span className="flex flex-wrap items-center gap-2">
                            {/* 历史单没有原因枚举（改动前只有自由文本），不补编一个原因给卖家看 */}
                            {data.reasonCode ? TICKET_REASON_LABEL[data.reasonCode] : "买家未选择"}
                            {/* 强制受理已经体现在下发的工作台动作集里（这里根本没有「拒绝」那一项），
                                但少了一个按钮得给说法，否则卖家会以为是界面坏了 */}
                            {data.noReasonEnforced && data.status === "APPLYING" && (
                                <Badge variant="warning">七天无理由，不可拒绝受理</Badge>
                            )}
                        </span>
                    </Row>
                    <Row label="补充说明">{data.reason ?? "买家未填写"}</Row>
                    {/* 退货物流按态给而不按动作给：确认收货要核对单号，拒绝寄回件同样得先看清寄的是哪一单 */}
                    {data.status === "RETURNING" && (
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

/**
 * 拒绝这条路的表单体：理由必填，校验挂在提交上——空着点「确认拒绝」只得到一行提示，不发请求。
 * BaseUI 关闭即卸载，所以每次打开都回到空白，不必手动 reset。
 */
function RejectReasonForm({
    onCancel,
    onSubmit,
}: {
    onCancel: () => void
    onSubmit: (reason: string) => void
}) {
    const form = useAppForm({
        defaultValues: { reason: "" },
        validators: { onSubmit: RejectSchema },
        onSubmit: ({ value }) => onSubmit(value.reason.trim()),
    })
    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
            }}
        >
            <form.AppField name="reason">
                {(field) => (
                    <field.TextareaField
                        aria-label="拒绝理由"
                        placeholder="例如：退回商品缺少吊牌，影响二次销售"
                        rows={3}
                        maxLength={200}
                    />
                )}
            </form.AppField>
            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                >
                    取消
                </Button>
                <Button
                    type="submit"
                    variant="destructive"
                >
                    确认拒绝
                </Button>
            </DialogFooter>
        </form>
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
