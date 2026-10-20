import { createFileRoute, Link } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import { translateWeb } from "#/locales"
import { ArrowLeft, CircleAlert } from "lucide-react"
import { noop, useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { useI18n } from "@shop/app-kit/i18n"
import { SearchHeader } from "#/shared/ui/SearchHeader"
import {
    CarrierBar,
    LogisticsSummaryCard,
    ReceiverLine,
    shipmentStatusLabel,
    TrackingTimeline,
    buildShipmentTracks,
    orderTrackingOptions,
} from "#/domains/logistics"
import { orderDetailOptions, receiverFullAddress, type OrderDetail } from "#/domains/order"
import type { ShipmentTrack } from "#/domains/logistics"
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
} from "@shop/ui-web"

export const Route = createFileRoute("/_authenticated/logistics/$orderId")({
    loader: async ({ context, params }) => {
        if (import.meta.env.SSR) return
        await context.queryClient.query({
            ...orderTrackingOptions(params.orderId),
            staleTime: "static",
        })
        void context.queryClient
            .query({ ...orderDetailOptions(params.orderId), staleTime: "static" })
            .catch(noop)
    },
    pendingComponent: LogisticsSkeleton,
    component: LogisticsPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.logistics", match.context.locale) }],
    }),
})

function LogisticsSkeleton() {
    const t = useT("logistics")
    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader
                title={t("logistics.page.title")}
                containerClassName="max-w-narrow"
            />
            <div className="narrow-page space-y-6">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
            </div>
        </div>
    )
}

function LogisticsPage() {
    const { orderId } = Route.useParams()
    const { locale } = useI18n()
    const t = useT()
    const tracking = useSuspenseQuery(orderTrackingOptions(orderId)).data
    const order = useOrderDetailOrNull(orderId)

    const tracks = buildShipmentTracks(tracking?.shipments ?? [], locale, order, t)
    const primary = tracks.find((track) => track.direction === "FORWARD") ?? tracks[0]
    const fullAddress = order ? receiverFullAddress(order) : ""

    return (
        <div className="flex flex-1 flex-col">
            <SearchHeader
                title={t("logistics.page.title")}
                containerClassName="max-w-narrow"
            />

            <div className="narrow-page">
                <BackToOrder orderId={orderId} />

                {/* 没有轨迹 = 未发货（404 已在数据层归零为 null）：这不是错误，给「暂无物流信息」 */}
                {primary === undefined ? (
                    <NoTracking />
                ) : (
                    <LogisticsBody
                        primary={primary}
                        tracks={tracks}
                        order={order}
                        fullAddress={fullAddress}
                    />
                )}
            </div>
        </div>
    )
}

function BackToOrder({ orderId }: { orderId: string }) {
    const t = useT("logistics")
    return (
        <Link
            to="/orders/$orderId"
            params={{ orderId }}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
            <ArrowLeft className="size-3.5" />
            {t("logistics.backToOrder")}
        </Link>
    )
}

function NoTracking() {
    const t = useT("logistics")
    return (
        <Empty className="py-16">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <CircleAlert />
                </EmptyMedia>
                <EmptyTitle>{t("logistics.empty.title")}</EmptyTitle>
                <EmptyDescription>{t("logistics.empty.description")}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    )
}

function LogisticsBody({
    primary,
    tracks,
    order,
    fullAddress,
}: {
    primary: NonNullable<ShipmentTrack>
    tracks: ShipmentTrack[]
    order: OrderDetail | undefined
    fullAddress: string
}) {
    const t = useT()
    return (
        <div className="space-y-6">
            <LogisticsSummaryCard
                statusLabel={shipmentStatusLabel(primary.status, t)}
                city={order?.receiverCity ?? undefined}
                receiverName={order?.receiverName ?? ""}
                receiverPhone={order?.receiverPhone ?? ""}
                address={fullAddress}
                thumbnail={order?.items[0]?.image}
            />

            {tracks.map((track) => (
                <section
                    key={track.trackingNo}
                    className="border-b border-border/60 pb-6 last:border-b-0"
                >
                    <CarrierBar
                        carrierName={track.carrierName}
                        trackingNo={track.trackingNo}
                        title={
                            track.direction === "RETURN"
                                ? t("logistics.carrier.returnTitle")
                                : undefined
                        }
                    />
                    <TrackingTimeline
                        className="pt-3"
                        groups={track.groups}
                    />
                </section>
            ))}

            {order && (
                <ReceiverLine
                    receiverName={order.receiverName}
                    receiverPhone={order.receiverPhone}
                    address={fullAddress}
                />
            )}
        </div>
    )
}

/**
 * 必须在调用点退出全局默认：orderDetailOptions 的另一个消费者是订单详情页的 useSuspenseQuery
 * （那处要抛给路由错误页，而 suspense 变体会忽略 options 里的 throwOnError），
 * 所以「这份数据在这里只是降级」的决定属于本页，不属于 options。
 */
function useOrderDetailOrNull(orderId: string): OrderDetail | undefined {
    return useQuery({ ...orderDetailOptions(orderId), throwOnError: false }).data
}
