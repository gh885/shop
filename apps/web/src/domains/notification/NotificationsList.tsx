import { useI18n } from "@shop/app-kit/i18n"
import { formatDateTime } from "@shop/app-kit/display"
import { Button, Skeleton, cn } from "@shop/ui-web"

import { Price } from "#/shared/ui/Price"
import { useT } from "#/locales/use-t"
import type { NotificationView } from "@shop/api/sdk"

import { useMarkAllNotificationsRead, useMarkNotificationRead } from "./queries"

/**
 * 通知列表：已读 mutation 住在这里（反馈与失效交全局 MutationCache），跳转由页面按
 * type 解析成路由调用——组件不 import 路由树，保持可脱离 router 上下文测试。
 * 文案在后端只存 type + params，模板插值在这里做：后端落文案，英文用户就永远收到中文消息。
 */
export function NotificationsList({
    items,
    loading,
    nextCursor,
    onOpen,
    onLoadMore,
}: {
    items: readonly NotificationView[]
    loading: boolean
    nextCursor?: string | null
    onOpen: (item: NotificationView) => void
    onLoadMore: () => void
}) {
    const t = useT()
    const { locale } = useI18n()
    const markAll = useMarkAllNotificationsRead()
    const markRead = useMarkNotificationRead()

    function open(item: NotificationView) {
        if (!item.readAt) markRead.mutate(item.id)
        onOpen(item)
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{t("notification.page.title")}</h2>
                {items.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAll.mutate()}
                        disabled={markAll.isPending}
                    >
                        {t("notification.markAllRead")}
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        // oxlint-disable-next-line react/no-array-index-key, react-doctor/no-array-index-key
                        <Skeleton
                            key={index}
                            className="h-16 w-full rounded-lg"
                        />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                    {t("notification.empty")}
                </p>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => (
                        <NotificationRow
                            key={item.id}
                            item={item}
                            locale={locale}
                            onOpen={() => open(item)}
                        />
                    ))}
                    {nextCursor && (
                        <div className="flex justify-center">
                            <Button
                                variant="outline"
                                onClick={onLoadMore}
                            >
                                {t("common.loadMore")}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/** params 是 jsonb object 出来的 unknown 值，模板插值只收字符串——非字符串一律空串兜底。 */
function asText(value: unknown): string {
    return typeof value === "string" ? value : ""
}

function NotificationRow({
    item,
    locale,
    onOpen,
}: {
    item: NotificationView
    locale: ReturnType<typeof useI18n>["locale"]
    onOpen: () => void
}) {
    const t = useT()

    const copy = (() => {
        switch (item.type) {
            case "shipment_recorded":
                return t("notification.item.shipmentRecorded", {
                    carrierCode: asText(item.params.carrierCode),
                    trackingNo: asText(item.params.trackingNo),
                })
            case "refund_succeeded":
                return t("notification.item.refundSucceeded")
            case "order_completed":
                return t("notification.item.orderCompleted")
            default:
                return t("notification.fallback")
        }
    })()

    // 跳转目标由页面解析；没有跳转目标的（如商家侧消息落到买家列表之外）只是不可点的行
    const clickable =
        item.type === "shipment_recorded" ||
        item.type === "refund_succeeded" ||
        item.type === "order_completed"

    const content = (
        <>
            {!item.readAt && (
                <span
                    aria-hidden
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                />
            )}
            <span className="min-w-0 flex-1">
                <span
                    className={cn(
                        "block text-sm",
                        item.readAt ? "text-muted-foreground" : "text-foreground",
                    )}
                >
                    {copy}
                </span>
                {item.type === "refund_succeeded" &&
                    typeof item.params.amount === "number" &&
                    typeof item.params.currency === "string" && (
                        <Price
                            className="mt-1 block text-sm"
                            value={{ amount: item.params.amount, currency: item.params.currency }}
                        />
                    )}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDateTime(item.createdAt, locale)}
            </span>
        </>
    )

    if (!clickable) {
        return (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background px-4 py-3">
                {content}
            </div>
        )
    }

    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-start gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 text-left transition-colors hover:bg-muted/50"
        >
            {content}
        </button>
    )
}
