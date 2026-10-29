import { copyWithNotify, formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"
import { Copy } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Separator, Button } from "@shop/ui-web"

import { ORDER_FIELD_STATUS_KEY, mainProgressLabel } from "./order-label"
import { parseShippingAddress, receiverFullAddress, type OrderDetail } from "./rules"

export interface OrderSummaryCardProps {
    order: OrderDetail
}

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
    const address = parseShippingAddress(order.shippingAddressJson)
    const fullAddress = receiverFullAddress(address)

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader>
                    <CardTitle>{t("order.summary.payment.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <InfoRow label={t("order.summary.payment.goodsTotal")}>
                        <Price
                            value={order.payAmount}
                            className="text-sm"
                        />
                    </InfoRow>
                    <Separator className="my-2" />
                    <InfoRow label={t("order.summary.payment.paid")}>
                        <Price
                            value={order.paid}
                            className="text-lg font-bold text-foreground"
                        />
                    </InfoRow>
                </CardContent>
            </Card>

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
                        <InfoRow label={t("order.summary.info.receiver")}>
                            <span className="block leading-relaxed">
                                {address.receiverName} {address.receiverPhone}
                                <br />
                                {fullAddress}
                            </span>
                        </InfoRow>
                        <InfoRow label={t(ORDER_FIELD_STATUS_KEY)}>
                            {mainProgressLabel(order.status, t)}
                        </InfoRow>
                        <InfoRow label={t("order.summary.info.createdAt")}>
                            {formatDateTime(order.createdAt, locale)}
                        </InfoRow>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
