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
} from "#/logistics"
import { orderDetailOptions, receiverFullAddress, type OrderDetail } from "#/order"
import type { ShipmentTrack } from "#/logistics"
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
} from "@shop/ui-web"

export const Route = createFileRoute("/_protected/logistics/$orderId")({
    /**
     * 数据在 loader 里读完再渲染（官方 loader-as-data-source）：
     * - 轨迹是页面主体 → 预取后失败抛出 → 路由错误页 + 官方重置重试；
     *   「未发货」已由 queryFn 归零为 null，不走错误态；
     * - 订单详情是降级数据（少它只少两条商家侧事件与一行收货信息）→ 预热即可，失败吞掉；
     * - 挂起 → `pendingComponent`；SSR 阶段服务端拿不到 token，直接跳过。
     */
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

/** 挂起占位：与真实结构同形（页头 + 摘要卡 + 轨迹轴） */
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

/**
 * 物流详情页（独立页，与订单详情同族页头）。
 *
 * 数据两路：轨迹（本模块，页面主体）+ 订单详情（只借三样东西——收货地址、主图、下单/发货时刻）。
 * 订单侧事件由 buildShipmentTracks 并进首个正向包裹的轴尾，页面只负责拼块。
 */
function LogisticsPage() {
    const { orderId } = Route.useParams()
    const { locale } = useI18n()
    const t = useT()
    // 主体数据：loader 已读完（404 归零为 null = 「暂无物流信息」），失败已由路由错误页接管
    const tracking = useSuspenseQuery(orderTrackingOptions(orderId)).data
    const order = useOrderDetailOrNull(orderId)

    // 摘要卡口径 = 首个正向包裹（与订单列表里那条物流摘要同源）
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

/** 返回订单详情的行内链接（退货包裹与正向共用同一份轨迹页） */
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

/** 未发货（还没有任何包裹轨迹） */
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

/** 有轨迹时的页面主体：摘要卡 + 一单多包裹（每条包裹一条轴）+ 收货人一行 */
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

            {/* 一单多包裹：每条包裹一条轴（承运商条 + 轨迹） */}
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
 * 降级数据：订单详情只是页面主体的附属（少它只少两条商家侧事件与一行收货信息），拿不到不连累轨迹。
 *
 * 必须在调用点退出全局默认：orderDetailOptions 的另一个消费者是订单详情页的 useSuspenseQuery
 * （那处要抛给路由错误页，而 suspense 变体会忽略 options 里的 throwOnError），
 * 所以「这份数据在这里只是降级」的决定属于本页，不属于 options。
 */
function useOrderDetailOrNull(orderId: string): OrderDetail | undefined {
    return useQuery({ ...orderDetailOptions(orderId), throwOnError: false }).data
}
