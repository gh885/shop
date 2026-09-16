import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, CircleAlert } from "lucide-react"

import { AccountHeader } from "#/account"
import {
    CarrierBar,
    LogisticsSummaryCard,
    ReceiverLine,
    SHIPMENT_STATUS_LABEL,
    TrackingTimeline,
    buildShipmentTracks,
    useOrderTracking,
} from "#/logistics"
import { useOrderDetail } from "#/order"
import { toApiError } from "@shop/common"
import {
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
} from "@shop/ui-web"

export const Route = createFileRoute("/_protected/logistics/$orderId")({
    component: LogisticsPage,
    head: () => ({
        meta: [{ title: "物流详情 - Shop" }],
    }),
})

/**
 * 物流详情页（独立页，与订单详情同族页头）。
 *
 * 数据两路：轨迹（本模块）+ 订单详情（只借三样东西——收货地址、主图、下单/发货时刻）。
 * 订单侧事件由 buildShipmentTracks 并进首个正向包裹的轴尾，页面只负责拼块。
 */
function LogisticsPage() {
    const { orderId } = Route.useParams()
    const tracking = useOrderTracking(orderId)
    const detail = useOrderDetail(orderId)

    const order = detail.data
    const tracks = buildShipmentTracks(tracking.data?.shipments ?? [], order)
    // 摘要卡口径 = 首个正向包裹（与订单列表里那条物流摘要同源）
    const primary = tracks.find((track) => track.direction === "FORWARD") ?? tracks[0]
    const fullAddress = order
        ? `${order.receiverProvince}${order.receiverCity}${order.receiverDistrict}${order.receiverDetail}`
        : ""

    const loading = tracking.isLoading || detail.isLoading
    // 未发货不是错误：后端 404 是「还没有物流」的正常语义，只有其它错误才算加载失败
    const notShipped = tracking.isError && toApiError(tracking.error).status === 404

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

                {/* 只有轨迹失败才拦整页：订单详情挂了就降级（少两条商家侧事件、少一行收货信息），不连累轨迹 */}
                {loading ? (
                    <div className="space-y-6">
                        <Skeleton className="h-24 w-full rounded-lg" />
                        <Skeleton className="h-64 w-full rounded-lg" />
                    </div>
                ) : tracking.isError && !notShipped ? (
                    <Empty className="py-16">
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <CircleAlert />
                            </EmptyMedia>
                            <EmptyTitle>加载失败</EmptyTitle>
                            <EmptyDescription>请稍后重试或刷新页面。</EmptyDescription>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void tracking.refetch()}
                            >
                                重新加载
                            </Button>
                        </EmptyHeader>
                    </Empty>
                ) : notShipped || !primary ? (
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
