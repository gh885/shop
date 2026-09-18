import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, CircleAlert } from "lucide-react"
import { noop, useQuery, useSuspenseQuery } from "@tanstack/react-query"

import { AccountHeader } from "#/account"
import {
    CarrierBar,
    LogisticsSummaryCard,
    ReceiverLine,
    SHIPMENT_STATUS_LABEL,
    TrackingTimeline,
    buildShipmentTracks,
    orderTrackingOptions,
} from "#/logistics"
import { orderDetailOptions } from "#/order"
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
    head: () => ({
        meta: [{ title: "物流详情 - Shop" }],
    }),
})

/** 挂起占位：与真实结构同形（页头 + 摘要卡 + 轨迹轴） */
function LogisticsSkeleton() {
    return (
        <div className="flex flex-1 flex-col">
            <AccountHeader
                title="物流详情"
                widthClass="max-w-narrow"
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
    // 主体数据：loader 已读完（404 归零为 null = 「暂无物流信息」），失败已由路由错误页接管
    const tracking = useSuspenseQuery(orderTrackingOptions(orderId)).data
    // 降级数据：非 suspense，拿不到就少画那几块，不连累轨迹。
    // 必须在调用点退出全局默认：orderDetailOptions 的另一个消费者是订单详情页的
    // useSuspenseQuery（那处要抛给路由错误页，而 suspense 变体会忽略 options 里的 throwOnError），
    // 所以「这份数据在这里只是降级」的决定属于本页，不属于 options
    const detail = useQuery({ ...orderDetailOptions(orderId), throwOnError: false })

    const order = detail.data
    const tracks = buildShipmentTracks(tracking?.shipments ?? [], order)
    // 摘要卡口径 = 首个正向包裹（与订单列表里那条物流摘要同源）
    const primary = tracks.find((track) => track.direction === "FORWARD") ?? tracks[0]
    const fullAddress = order
        ? `${order.receiverProvince}${order.receiverCity}${order.receiverDistrict}${order.receiverDetail}`
        : ""

    return (
        <div className="flex flex-1 flex-col">
            <AccountHeader
                title="物流详情"
                widthClass="max-w-narrow"
            />

            <div className="narrow-page">
                <Link
                    to="/orders/$orderId"
                    params={{ orderId }}
                    className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-3.5" />
                    返回订单详情
                </Link>

                {/* 没有轨迹 = 未发货（404 已在数据层归零为 null）：这不是错误，给「暂无物流信息」 */}
                {primary === undefined ? (
                    <Empty className="py-16">
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <CircleAlert />
                            </EmptyMedia>
                            <EmptyTitle>暂无物流信息</EmptyTitle>
                            <EmptyDescription>商家发货后，物流轨迹会显示在这里。</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <div className="space-y-6">
                        <LogisticsSummaryCard
                            statusLabel={SHIPMENT_STATUS_LABEL[primary.status]}
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
                                    title={track.direction === "RETURN" ? "退货物流" : undefined}
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
                )}
            </div>
        </div>
    )
}
