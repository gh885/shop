import type { SellerTicketItem } from "@shop/api/sdk"
import { Badge, Button, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shop/ui-web"
import { formatMoney } from "@shop/common"
import { formatDateTime } from "@shop/app-kit"

import { TICKET_STATUS_LABEL, TICKET_TYPE_LABEL } from "#/order/constants"
import { REFUND_ACTION_LABEL, refundRowActions, type RefundRowAction } from "#/order/refund/model"
import { CopyableText } from "#/shared/ui/CopyableText"
import { TableCard } from "#/shared/ui/TableCard"

/**
 * 退款售后工作台表格：售后单（类型 + 状态）/ 商品 / 订单号 / 买家 / 退款金额 / 买家理由 / 申请时间 / 操作。
 *
 * 纯展示 + 事件上抛：不拉数据、不写 URL、不发请求（容器持有分页状态与 mutation）。
 * 卡片式排布而不是压成一行：工作台的每一行都要被"读"（理由 + 类型 + 金额）才能决定，不是扫一眼就过。
 */

const STATUS_VARIANT: Record<
    SellerTicketItem["status"],
    "warning" | "success" | "destructive" | "secondary"
> = {
    APPLYING: "warning",
    RETURNING: "warning",
    REFUNDED: "success",
    REJECTED: "destructive",
    CLOSED: "secondary",
}

export interface RefundTableProps {
    rows: SellerTicketItem[]
    page: number
    pageSize: number
    total: number
    /** 正在处理的售后单 id：该行按钮禁用，防重复提交 */
    busyId?: string
    onPageChange: (page: number) => void
    /** 行内动作：只回传这一行所需的三项（售后单 id 判忙/确认、订单 id 走请求、单号进文案） */
    onAction: (ticket: RefundRowIdentity, action: RefundRowAction) => void
}

/** 行内动作需要的一行身份：售后单 id + 它所属的订单 id / 单号（售后单由父级持有，不回传整行） */
export type RefundRowIdentity = Pick<SellerTicketItem, "id" | "orderId" | "orderNo">

const rowIdentity = (ticket: SellerTicketItem): RefundRowIdentity => ({
    id: ticket.id,
    orderId: ticket.orderId,
    orderNo: ticket.orderNo,
})

export function RefundTable({
    rows,
    page,
    pageSize,
    total,
    busyId,
    onPageChange,
    onAction,
}: RefundTableProps) {
    return (
        <TableCard
            total={total}
            unit="笔售后"
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead>售后单</TableHead>
                    <TableHead className="min-w-56">商品</TableHead>
                    <TableHead>订单号</TableHead>
                    <TableHead>买家</TableHead>
                    <TableHead className="text-right">退款金额</TableHead>
                    <TableHead className="min-w-40">买家理由</TableHead>
                    <TableHead className="min-w-36">申请时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((ticket) => (
                    <TableRow key={ticket.id}>
                        <TableCell>
                            <div className="flex flex-col items-start gap-1">
                                <Badge variant="outline">{TICKET_TYPE_LABEL[ticket.type]}</Badge>
                                <Badge variant={STATUS_VARIANT[ticket.status]}>
                                    {TICKET_STATUS_LABEL[ticket.status]}
                                </Badge>
                            </div>
                        </TableCell>

                        <TableCell>
                            <p className="max-w-56 truncate font-medium">{ticket.firstItemName}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                                共 {ticket.itemCount} 件商品
                            </p>
                        </TableCell>

                        <TableCell>
                            <CopyableText
                                value={ticket.orderNo}
                                label="订单号"
                                className="tabular-nums"
                            />
                        </TableCell>

                        <TableCell>{ticket.receiverName}</TableCell>

                        <TableCell className="text-right tabular-nums">
                            {formatMoney(ticket.refundAmount)}
                        </TableCell>

                        <TableCell>
                            <span className="line-clamp-2 text-muted-foreground">
                                {ticket.reason ?? "买家未填写"}
                            </span>
                        </TableCell>

                        <TableCell
                            variant="muted"
                            className="tabular-nums"
                        >
                            {formatDateTime(ticket.createdAt)}
                        </TableCell>

                        <TableCell className="text-right">
                            <RowActions
                                ticket={ticket}
                                busy={busyId === ticket.id}
                                onAction={(action) => onAction(rowIdentity(ticket), action)}
                            />
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </TableCard>
    )
}

/** 行内动作：吃后端下发的动作集（终态行没有动作，给一条说明而不是留白） */
function RowActions({
    ticket,
    busy,
    onAction,
}: {
    ticket: SellerTicketItem
    busy: boolean
    onAction: (action: RefundRowAction) => void
}) {
    const actions = refundRowActions(ticket)
    if (actions.length === 0) {
        return <span className="text-xs text-muted-foreground">已处理</span>
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
                    {REFUND_ACTION_LABEL[action]}
                </Button>
            ))}
        </div>
    )
}
