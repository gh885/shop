import { formatDateTime } from "@shop/app-kit"

import { Price } from "#/shared/ui/Price"
import { DiscountPrice } from "#/shared/ui/DiscountPrice"

import { ORDER_STATUS_LABEL } from "./constants"
import type { OrderDetail } from "./model"
import { Copy, ChevronDown } from "lucide-react"
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Separator,
    Button,
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
} from "@shop/ui-web"

/**
 * 详情页右侧信息卡：两大块 —— 付款详情、订单信息。
 *
 * - 付款详情：商品总额 / 运费 / 实付款（金额敏感，突出显示）
 * - 订单信息：订单号、收货信息、订单状态、各状态时间轴
 * 信息项是否出现与订单状态有关（如未付款不显示支付时间）。
 * 订单快照字段来自后端（receiverName/receiverProvince/...、paidAt/shippedAt/completedAt）。
 */

export interface OrderSummaryCardProps {
    order: OrderDetail
}

const dateStr = (iso: string | null) => (iso ? formatDateTime(iso) : "—")

/** 单条「label: value」信息行 */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="text-right text-foreground">{children}</span>
        </div>
    )
}

export function OrderSummaryCard({ order }: OrderSummaryCardProps) {
    const fullAddress =
        order.receiverProvince + order.receiverCity + order.receiverDistrict + order.receiverDetail

    return (
        <div className="space-y-5">
            {/* 付款详情 */}
            <Card>
                <CardHeader>
                    <CardTitle>付款详情</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label="商品总价">
                        <Price
                            value={order.itemAmount}
                            className="text-sm"
                        />
                    </InfoRow>
                    <InfoRow label="运费(快递)">
                        <Price
                            value={order.shippingFee}
                            className="text-sm"
                        />
                    </InfoRow>
                    {/* 优惠是减项，只在真的减过钱时才出现；出现时三行必须加得起来：商品总价 + 运费 − 优惠 = 实付款 */}
                    {order.discountAmount.amount > 0 && (
                        <InfoRow label="优惠">
                            <DiscountPrice
                                value={order.discountAmount}
                                className="text-sm"
                            />
                        </InfoRow>
                    )}
                    <Separator className="my-2" />
                    <InfoRow label="实付款">
                        <Price
                            value={order.payAmount}
                            className="text-lg font-bold text-foreground"
                        />
                    </InfoRow>
                </CardContent>
            </Card>

            {/* 订单信息 */}
            <Card>
                <CardHeader>
                    <CardTitle>订单信息</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="divide-y divide-border/40">
                        <div className="py-1">
                            <InfoRow label="订单编号">
                                {order.orderNo}
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="ml-1"
                                    aria-label="复制订单号"
                                >
                                    <Copy />
                                </Button>
                            </InfoRow>
                        </div>
                        <InfoRow label="店铺">{order.shopName || "—"}</InfoRow>
                        <InfoRow label="收货信息">
                            <span className="block leading-relaxed">
                                {order.receiverName} {order.receiverPhone}
                                <br />
                                {fullAddress}
                            </span>
                        </InfoRow>
                        <InfoRow label="订单状态">{ORDER_STATUS_LABEL[order.status]}</InfoRow>
                        <InfoRow label="创建时间">{dateStr(order.createdAt)}</InfoRow>
                        <InfoRow label="付款时间">{dateStr(order.paidAt)}</InfoRow>
                        <InfoRow label="发货时间">{dateStr(order.shippedAt)}</InfoRow>
                        <InfoRow label="成交时间">{dateStr(order.completedAt)}</InfoRow>

                        {/* 「更多订单信息」折叠：默认收起，物流/留言等次要字段按需展开 */}
                        <Collapsible>
                            <CollapsibleTrigger className="group my-2 flex w-full items-center justify-center">
                                <span className="group-data-open:hidden">展开更多订单信息</span>
                                <span className="hidden group-data-open:inline">
                                    收起更多订单信息
                                </span>
                                <ChevronDown className="size-3.5 transition-transform group-data-open:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="my-1">
                                <InfoRow label="物流公司">{order.logisticsCompany || "—"}</InfoRow>
                                <InfoRow label="运单号">{order.trackingNo || "—"}</InfoRow>
                                <InfoRow label="买家留言">{order.buyerMessage || "—"}</InfoRow>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
