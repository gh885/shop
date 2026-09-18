import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { CircleAlert, Plus, TicketPercent } from "lucide-react"

import {
    Button,
    Card,
    CardContent,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
} from "@shop/ui-web"

import { useShop } from "#/shop"
import { useRowBusy } from "#/shared/lib/use-row-busy"
import { CouponFormDialog } from "./CouponFormDialog"
import { CouponTable } from "./CouponTable"
import { couponRowFromWire, type CouponListSearch } from "./model"
import { useCouponList, useStopCoupon } from "./queries"

/**
 * 优惠券管理页：本店券模板的发放总览与建券入口。
 *
 * 页面上明说「没有编辑」以及为什么——已领出的券按领取时的快照生效，改模板只影响后来人；
 * 想调整就停旧的、建新的。这个说明必须有，否则卖家会去找那个不存在的编辑按钮。
 */
export function CouponPage({ search }: { search: CouponListSearch }) {
    const shop = useShop()
    const navigate = useNavigate()
    const coupons = useCouponList(shop.id, search)
    const stop = useStopCoupon(shop.id)
    const { busyId, run } = useRowBusy()
    const [formOpen, setFormOpen] = useState(false)
    // 展示状态相对「现在」派生：一次挂载只取一个时刻，避免同一屏里各行跨秒判定不一致。
    // 取值走 useState 惰性初始化而不是在渲染里直接调 Date.now()：渲染必须是纯的（react/purity）。
    const [now] = useState(() => Date.now())

    const records = coupons.data?.records ?? []
    const total = coupons.data?.total ?? 0
    const rows = records.map((template) => couponRowFromWire(template, now))

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                    建券只定义发放规则，买家领取时才真正发出；「已发放」是领走的数量，「已核销」是真正被订单用掉的张数。
                </p>
                <Button onClick={() => setFormOpen(true)}>
                    <Plus className="size-4" />
                    新建券
                </Button>
            </div>

            <Card size="sm">
                <CardContent className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                        券模板没有「编辑」：已领出的券按领取时的快照生效，改模板只会影响后来人。
                        要调整规则，请停用旧券后再新建一张。
                    </p>
                </CardContent>
            </Card>

            {coupons.isLoading ? (
                <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton
                            key={i}
                            className="h-14 w-full rounded-xl"
                        />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <TicketPercent />
                        </EmptyMedia>
                        <EmptyTitle>还没有优惠券</EmptyTitle>
                        <EmptyDescription>
                            设置满减规则与发放总量后，买家就能在店铺页领取
                        </EmptyDescription>
                        {/* 空态给动作而不是只给指路：眼睛已经在空列表上，没必要再让它去找右上角 */}
                        <Button
                            className="mt-2"
                            onClick={() => setFormOpen(true)}
                        >
                            新建券
                        </Button>
                    </EmptyHeader>
                </Empty>
            ) : (
                <CouponTable
                    rows={rows}
                    page={search.page}
                    pageSize={search.size}
                    total={total}
                    busyId={busyId}
                    onPageChange={(page) =>
                        void navigate({
                            to: "/marketing/coupon",
                            search: { page, size: search.size },
                        })
                    }
                    onStop={(id) => run(stop.mutateAsync)(id)}
                />
            )}

            <CouponFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                shopId={shop.id}
            />
        </div>
    )
}
