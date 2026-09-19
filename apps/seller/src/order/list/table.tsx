import { Badge, Button, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shop/ui-web"
import { fenToYuan } from "@shop/common"
import { formatDate } from "@shop/app-kit"
import type { SellerOrderListItemResponse } from "@shop/api/sdk"

import { imgUrl } from "#/shared/lib/image"
import { CopyableText } from "#/shared/ui/CopyableText"
import { TableCard } from "#/shared/ui/TableCard"
import { AFTER_SALE_META, ORDER_STATUS_META } from "#/order/constants"

interface OrderTableProps {
    rows: SellerOrderListItemResponse[]
    page: number
    pageSize: number
    total: number
    /** 单个订单正在执行的动作（如发货中），用于禁用对应行按钮 */
    busyId?: string
    onPageChange: (page: number) => void
    /** 待发货 → 发货（打开发货弹窗）：只回传所需的两项，不回传整行 */
    onShip: (order: OrderIdentity) => void
    /** 售后申请中 → 同意 */
    onAgreeAfterSale: (order: OrderIdentity) => void
    /** 售后申请中 → 拒绝 */
    onRejectAfterSale: (order: OrderIdentity) => void
    /** 退货退款 · 退货中 → 确认收货 */
    onReceiveReturn: (order: OrderIdentity) => void
}

/** 行操作需要的订单身份：订单 id（请求）+ 单号（展示/确认文案） */
export type OrderIdentity = Pick<SellerOrderListItemResponse, "id" | "orderNo">

/**
 * 订单列表主表格：商品（图+名+共N件）/ 订单号 / 买家 / 实付金额 / 状态（主+售后徽章）/ 下单时间 / 操作。
 * 纯展示 + 事件上抛：数据与分页状态由容器持有（URL 同步），本组件不拉数据不写 URL。
 */
export function OrderTable({
    rows,
    page,
    pageSize,
    total,
    busyId,
    onPageChange,
    onShip,
    onAgreeAfterSale,
    onRejectAfterSale,
    onReceiveReturn,
}: OrderTableProps) {
    return (
        <TableCard
            total={total}
            unit="笔订单"
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead className="min-w-64">商品</TableHead>
                    <TableHead>订单号</TableHead>
                    <TableHead>买家</TableHead>
                    <TableHead className="text-right">实付金额</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="min-w-36">下单时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((o) => (
                    <OrderRow
                        key={o.id}
                        order={o}
                        busy={o.id === busyId}
                        onShip={() => onShip(orderIdentity(o))}
                        onAgreeAfterSale={() => onAgreeAfterSale(orderIdentity(o))}
                        onRejectAfterSale={() => onRejectAfterSale(orderIdentity(o))}
                        onReceiveReturn={() => onReceiveReturn(orderIdentity(o))}
                    />
                ))}
            </TableBody>
        </TableCard>
    )
}

const orderIdentity = (o: SellerOrderListItemResponse): OrderIdentity => ({
    id: o.id,
    orderNo: o.orderNo,
})

/** 首件商品（列表已有行明细）：缩略图 + 标题 + 共 N 件 */
function ItemsCell({ order }: { order: SellerOrderListItemResponse }) {
    const first = order.items[0]
    return (
        <div className="flex items-start gap-3">
            <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {first?.image ? (
                    <img
                        src={imgUrl(first.image)}
                        alt={first.name}
                        loading="lazy"
                        className="size-full object-cover"
                    />
                ) : undefined}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
                <p
                    className="truncate font-medium"
                    title={first?.name}
                >
                    {first?.name ?? "—"}
                </p>
                {order.itemCount > 1 && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                        共 {order.itemCount} 件
                    </p>
                )}
            </div>
        </div>
    )
}

/** 单行：商品 / 单号 / 买家 / 实付 / 状态（主+售后）/ 下单时间 / 行内操作 */
function OrderRow({
    order: o,
    busy,
    onShip,
    onAgreeAfterSale,
    onRejectAfterSale,
    onReceiveReturn,
}: {
    order: SellerOrderListItemResponse
    busy: boolean
    onShip: () => void
    onAgreeAfterSale: () => void
    onRejectAfterSale: () => void
    onReceiveReturn: () => void
}) {
    const statusMeta = ORDER_STATUS_META[o.status]
    const saleMeta = o.afterSaleStatus === "NONE" ? undefined : AFTER_SALE_META[o.afterSaleStatus]

    return (
        <TableRow>
            <TableCell>
                <ItemsCell order={o} />
            </TableCell>
            <TableCell>
                <CopyableText
                    value={o.orderNo}
                    label="订单号"
                    className="font-medium tabular-nums"
                />
            </TableCell>
            {/* 买家：收货人 + 手机（手机可空） */}
            <TableCell>
                <div className="space-y-0.5">
                    <p className="truncate font-medium">{o.receiverName}</p>
                    {o.receiverPhone && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                            {o.receiverPhone}
                        </p>
                    )}
                </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
                ¥{fenToYuan(o.payAmount.amount)}
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    {saleMeta && <Badge variant={saleMeta.variant}>{saleMeta.label}</Badge>}
                </div>
            </TableCell>
            <TableCell className="tabular-nums">{formatDate(o.createdAt)}</TableCell>

            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    {/* 待发货 → 发货 */}
                    {o.status === "PAID" && (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onShip}
                        >
                            发货
                        </Button>
                    )}
                    {/* 售后申请中 → 同意 / 拒绝（退货退款同意后进入退货流程） */}
                    {o.afterSaleStatus === "APPLYING" && (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={onAgreeAfterSale}
                            >
                                同意
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={onRejectAfterSale}
                            >
                                拒绝
                            </Button>
                        </>
                    )}
                    {/* 退货退款 · 退货中 → 确认收货（回补库存并退款） */}
                    {o.afterSaleStatus === "RETURNING" && (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onReceiveReturn}
                        >
                            确认收货
                        </Button>
                    )}
                    {o.status !== "PAID" &&
                        o.afterSaleStatus !== "APPLYING" &&
                        o.afterSaleStatus !== "RETURNING" && (
                            <span className="text-xs text-muted-foreground">—</span>
                        )}
                </div>
            </TableCell>
        </TableRow>
    )
}
