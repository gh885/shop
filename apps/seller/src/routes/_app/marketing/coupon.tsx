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
import { useT } from "#/locales/use-t"
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
    const t = useT("coupon")
    const { rows, total, isPending, busyId, stop } = useCouponList(shop.id, search)
    const [formOpen, setFormOpen] = useState(false)

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{t("seller.coupon.page.intro")}</p>
                <Button onClick={() => setFormOpen(true)}>
                    <Plus className="size-4" />
                    {t("seller.coupon.page.create")}
                </Button>
            </div>

            <Card size="sm">
                <CardContent className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                        {t("seller.coupon.page.noEditNotice")}
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
                        <EmptyTitle>{t("seller.coupon.page.empty.title")}</EmptyTitle>
                        <EmptyDescription>
                            {t("seller.coupon.page.empty.description")}
                        </EmptyDescription>
                        {/* 空态给动作而不是只给指路：眼睛已经在空列表上，没必要再让它去找右上角 */}
                        <Button
                            className="mt-2"
                            onClick={() => setFormOpen(true)}
                        >
                            {t("seller.coupon.page.create")}
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
