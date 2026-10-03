import {
    Badge,
    Button,
    Image,
    MaskedValueCell,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@shop/ui-web"
import { formatMoney } from "@shop/common/domain"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import type { SellerOrderListItemResponse, TicketAvailableAction } from "@shop/api/sdk"
import { useState } from "react"

import { imgUrl } from "#/shared/lib/image"
import { CopyableText } from "#/shared/ui/CopyableText"
import { TableCard } from "#/shared/ui/TableCard"
import { AFTER_SALE_META, ORDER_STATUS_META } from "#/order/constants"
import { REFUND_ACTION_LABEL, refundRowActions, type RefundRowAction } from "#/order/refund/model"

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
    /** 一行订单可做的售后动作（aftersale 按本页订单批查下发；无进行中的单 = 空集） */
    afterSaleActionsOf: (orderId: string) => TicketAvailableAction[]
    /** 售后动作上抛：动作种类即后端下发的契约值，页面只负责路由到对应 mutation */
    onAfterSaleAction: (order: OrderIdentity, action: RefundRowAction) => void
    /** 查看这一行买家的电话明文：出参只有掩码，明文逐单索取且留痕（ORD-62） */
    onRevealPhone: (order: OrderIdentity) => void
    /** 正在索取明文的订单 id：那一行的「查看」禁用，连点不会多刷出几条取用留痕 */
    revealingId?: string
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
    afterSaleActionsOf,
    onAfterSaleAction,
    onRevealPhone,
    revealingId,
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
                        afterSaleActions={afterSaleActionsOf(o.id)}
                        onShip={() => onShip(orderIdentity(o))}
                        onAfterSaleAction={(action) => onAfterSaleAction(orderIdentity(o), action)}
                        onRevealPhone={() => onRevealPhone(orderIdentity(o))}
                        revealingPhone={o.id === revealingId}
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
                <Image
                    src={imgUrl(first?.image ?? undefined)}
                    alt={first?.name}
                    className="size-full"
                />
            </div>
            <div className="min-w-0 max-w-64 flex-1 space-y-0.5">
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

/**
 * 收件人电话的「掩码 → 明文」接线在容器（useOrderList）：取到的明文写回列表缓存这一行，
 * 于是这一格只看字符串里还有没有 `****` 决定给不给入口（MaskedValueCell）。
 */
/** 单行：商品 / 单号 / 买家 / 实付 / 状态（主+售后）/ 下单时间 / 行内操作 */
function OrderRow({
    order: o,
    busy,
    afterSaleActions,
    onShip,
    onAfterSaleAction,
    onRevealPhone,
    revealingPhone,
}: {
    order: SellerOrderListItemResponse
    busy: boolean
    /** 契约下发的售后动作（AGREE / REJECT / RECEIVE_RETURN…），空集 = 这一行没有可点的售后按钮 */
    afterSaleActions: TicketAvailableAction[]
    onShip: () => void
    onAfterSaleAction: (action: RefundRowAction) => void
    onRevealPhone: () => void
    /** 这一单的电话明文正在索取中 */
    revealingPhone: boolean
}) {
    const statusMeta = ORDER_STATUS_META[o.status]
    const saleMeta = o.afterSaleStatus === "NONE" ? undefined : AFTER_SALE_META[o.afterSaleStatus]
    const { locale } = useI18n()
    const t = useT()
    // 取值走 useState 惰性初始化而不是在渲染里直接调 Date.now()：渲染必须是纯的（react/purity）
    const [now] = useState(() => Date.now())
    /** 过了发货时限：系统不代关单（ORD-60），这里只给卖家一枚催办标记 */
    const shipOverdue =
        o.status === "PAID" && o.shipExpireAt !== null && new Date(o.shipExpireAt).getTime() < now
    const canShip = o.availableActions.includes("SHIP")
    const saleRowActions = refundRowActions({ availableActions: afterSaleActions })

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
            {/* 买家：收货人 + 电话（出参恒为掩码，明文要显式点一下） */}
            <TableCell>
                <div className="space-y-0.5">
                    <p className="truncate font-medium">{o.receiverName}</p>
                    <p className="text-xs text-muted-foreground">
                        <MaskedValueCell
                            value={o.receiverPhone}
                            subject={o.receiverName}
                            revealing={revealingPhone}
                            onReveal={onRevealPhone}
                        />
                    </p>
                </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {formatMoney(o.payAmount, locale)}
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={statusMeta.variant}>{t(statusMeta.labelKey)}</Badge>
                    {shipOverdue && <Badge variant="warning">超时未发货</Badge>}
                    {saleMeta && <Badge variant={saleMeta.variant}>{t(saleMeta.labelKey)}</Badge>}
                </div>
            </TableCell>
            <TableCell
                variant="muted"
                className="tabular-nums"
            >
                {formatDateTime(o.createdAt, locale)}
            </TableCell>

            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    {/* 发货按钮看契约下发的动作集，不按 status 硬推：PAID 首单发货、SHIPPED 追加包裹都带 SHIP */}
                    {canShip && (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={onShip}
                        >
                            发货
                        </Button>
                    )}
                    {/* 售后按钮同口径：动作集由 aftersale 批查下发（与工作台同源），
                        不按订单上的售后投影另推一张按钮表（ORD-51） */}
                    {saleRowActions.map((action) => (
                        <Button
                            key={action}
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => onAfterSaleAction(action)}
                        >
                            {REFUND_ACTION_LABEL[action]}
                        </Button>
                    ))}
                    {!canShip && saleRowActions.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                    )}
                </div>
            </TableCell>
        </TableRow>
    )
}
