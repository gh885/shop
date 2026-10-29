import { Badge, Button, Panel, PanelContent, PanelHeader } from "@shop/ui-web"

import { ChevronRight, Package } from "lucide-react"

import { MAIN_PROGRESS_TONE } from "./constants"
import { mainProgressHint, mainProgressLabel } from "./order-label"
import { canPay, type OrderAction, type Trade } from "./rules"
import { formatCountdown, useDeadline } from "#/shared/lib/use-deadline"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"

export interface TradeCardProps {
    trade: Trade
    /** 进这张订单组的详情页 */
    onDetail?: (orderGroupId: string) => void
    onPay?: (orderGroupId: string) => void
    pendingAction?: OrderAction
}

/**
 * 买家订单卡片 = 一次结算（订单组）。
 *
 * <p>列表接口只返回组级摘要（`BuyerOrderSummary`）：组号、展示态、应付金额、下单时间。
 * 商品明细与子单履约进度在详情页——列表页不做 N+1 查询。
 */
export function TradeCard({ trade, onDetail, onPay, pendingAction }: TradeCardProps) {
    const t = useT()
    const { locale } = useI18n()
    const pending = canPay(trade.status)
    const { seconds } = useDeadline(pending ? trade.payExpireAt : "")

    return (
        <Panel className="@container/order">
            <PanelHeader
                variant="muted"
                className="flex-wrap"
            >
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                            {t("order.card.placedAt", {
                                time: formatDateTime(trade.createdAt, locale),
                            })}
                        </span>
                        <span className="min-w-0 wrap-anywhere">
                            {t("order.card.tradeNo", { tradeNo: trade.tradeNo })}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {mainProgressHint(trade.status, t)}
                    </p>
                </div>

                <div className="ms-auto flex flex-wrap items-center gap-4">
                    {pending && (
                        <span className="text-xs font-medium text-destructive tabular-nums">
                            {t("order.card.remaining", { time: formatCountdown(seconds) })}
                        </span>
                    )}
                    <Badge variant={MAIN_PROGRESS_TONE[trade.status]}>
                        {mainProgressLabel(trade.status, t)}
                    </Badge>
                    {pending && (
                        <Button
                            variant="cta"
                            size="sm"
                            disabled={pendingAction === "pay"}
                            onClick={() => onPay?.(trade.id)}
                        >
                            {t("order.action.pay")}
                        </Button>
                    )}
                </div>
            </PanelHeader>

            <PanelContent>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Package
                            aria-hidden="true"
                            className="size-4 shrink-0"
                        />
                        <span className="tabular-nums">{trade.tradeNo}</span>
                    </p>
                    <p className="ms-auto flex flex-wrap items-baseline gap-2">
                        <span className="text-muted-foreground">{t("order.card.amount")}</span>
                        <Price
                            value={trade.payAmount}
                            className="text-lg font-medium text-primary-subtle-foreground"
                        />
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDetail?.(trade.id)}
                    >
                        {t("order.card.detail")}
                        <ChevronRight
                            aria-hidden="true"
                            data-icon="inline-end"
                        />
                    </Button>
                </div>
            </PanelContent>
        </Panel>
    )
}
