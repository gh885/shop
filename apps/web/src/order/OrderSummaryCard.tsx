import { copyWithNotify, formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { isPositiveMoney } from "@shop/common/domain"
import { Price } from "#/shared/ui/Price"
import { DiscountPrice } from "#/shared/ui/DiscountPrice"

import { ORDER_FIELD_STATUS_KEY, orderStatusLabel } from "./order-label"
import { receiverFullAddress, type OrderDetail } from "./model"
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
 * 详情页右侧信息卡：付款详情 + 订单信息。
 *
 * 信息项是否出现与订单状态有关（如未付款不显示支付时间）；
 * 订单快照字段来自后端（receiverName/receiverProvince/...、paidAt/shippedAt/completedAt）。
 */

export interface OrderSummaryCardProps {
    order: OrderDetail
}

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
    const { locale } = useI18n()
    const t = useT()
    // 跟着渲染走，不是模块级常量：模块级拿不到语言（§3.5 约束 2）
    const dateStr = (iso: string | null) => (iso ? formatDateTime(iso, locale) : "—")
    const fullAddress = receiverFullAddress(order)

    return (
        <div className="space-y-5">
            {/* 付款详情 */}
            <Card>
                <CardHeader>
                    <CardTitle>{t("order.summary.payment.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label={t("order.summary.payment.goodsTotal")}>
                        <Price
                            value={order.itemAmount}
                            className="text-sm"
                        />
                    </InfoRow>
                    <InfoRow label={t("order.summary.payment.shipping")}>
                        <Price
                            value={order.shippingFee}
                            className="text-sm"
                        />
                    </InfoRow>
                    {/* 优惠是减项，只在真的减过钱时才出现；出现时三行必须加得起来：商品总价 + 运费 − 优惠 = 实付款 */}
                    {isPositiveMoney(order.discountAmount) && (
                        <InfoRow label={t("order.summary.payment.discount")}>
                            <DiscountPrice
                                value={order.discountAmount}
                                className="text-sm"
                            />
                        </InfoRow>
                    )}
                    <Separator className="my-2" />
                    <InfoRow label={t("order.summary.payment.paid")}>
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
                    <CardTitle>{t("order.summary.info.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="divide-y divide-border/40">
                        <div className="py-1">
                            <InfoRow label={t("order.summary.info.orderNo")}>
                                {order.orderNo}
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="ml-1"
                                    aria-label={t("order.summary.info.copyOrderNo")}
                                    onClick={() => void copyWithNotify(order.orderNo)}
                                >
                                    <Copy />
                                </Button>
                            </InfoRow>
                        </div>
                        <InfoRow label={t("order.summary.info.shop")}>
                            {order.shopName || "—"}
                        </InfoRow>
                        <InfoRow label={t("order.summary.info.receiver")}>
                            <span className="block leading-relaxed">
                                {order.receiverName} {order.receiverPhone}
                                <br />
                                {fullAddress}
                            </span>
                        </InfoRow>
                        <InfoRow label={t(ORDER_FIELD_STATUS_KEY)}>
                            {orderStatusLabel(order.status, t)}
                        </InfoRow>
                        <InfoRow label={t("order.summary.info.createdAt")}>
                            {dateStr(order.createdAt)}
                        </InfoRow>
                        <InfoRow label={t("order.summary.info.paidAt")}>
                            {dateStr(order.paidAt)}
                        </InfoRow>
                        <InfoRow label={t("order.summary.info.shippedAt")}>
                            {dateStr(order.shippedAt)}
                        </InfoRow>
                        <InfoRow label={t("order.summary.info.completedAt")}>
                            {dateStr(order.completedAt)}
                        </InfoRow>

                        {/* 「更多订单信息」折叠：默认收起，物流/留言等次要字段按需展开 */}
                        <Collapsible>
                            <CollapsibleTrigger className="group my-2 flex w-full items-center justify-center">
                                <span className="group-data-open:hidden">
                                    {t("order.summary.info.expandMore")}
                                </span>
                                <span className="hidden group-data-open:inline">
                                    {t("order.summary.info.collapseMore")}
                                </span>
                                <ChevronDown className="size-3.5 transition-transform group-data-open:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="my-1">
                                <InfoRow label={t("order.summary.info.carrier")}>
                                    {order.logisticsCompany || "—"}
                                </InfoRow>
                                <InfoRow label={t("order.summary.info.trackingNo")}>
                                    {order.trackingNo || "—"}
                                </InfoRow>
                                <InfoRow label={t("order.summary.info.buyerMessage")}>
                                    {order.buyerMessage || "—"}
                                </InfoRow>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
