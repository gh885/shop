import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
    Button,
    Card,
    CardContent,
    DataTableSkeleton,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@shop/ui-web"
import { CircleAlert, Plus, TicketPercent } from "lucide-react"

import { CouponFormDialog } from "#/coupon/CouponFormDialog"
import { CouponTable } from "#/coupon/CouponTable"
import { couponListSearchSchema, type CouponListSearch } from "#/coupon/model"
import { useCouponList } from "#/coupon/use-coupon-list"
import { useShop } from "#/shop"

/**
 * 优惠券管理（/marketing/coupon）。
 *
 * 静态路由优先于捕获两段路径的 `$group/$leaf` 占位路由，所以这个文件一建，
 * 侧边栏「营销 → 优惠券」就不再落到 PlaceholderPage。
 */
export const Route = createFileRoute("/_app/marketing/coupon")({
    validateSearch: (search: Record<string, unknown>): CouponListSearch =>
        couponListSearchSchema.parse(search),
    component: CouponRoute,
})

/**
 * 优惠券管理页：本店券模板的发放总览与建券入口。
 *
 * 页面上明说「没有编辑」以及为什么——已领出的券按领取时的快照生效，改模板只影响后来人；
 * 想调整就停旧的、建新的。这个说明必须有，否则卖家会去找那个不存在的编辑按钮。
 */
function CouponRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const shop = useShop()
    const { rows, total, isPending, busyId, stop } = useCouponList(shop.id, search)
    const [formOpen, setFormOpen] = useState(false)

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

            {isPending ? (
                <DataTableSkeleton columns={7} />
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
                    onPageChange={(page) => void navigate({ search: { page, size: search.size } })}
                    onStop={stop}
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
