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

import { useOutOfRangePageGuard } from "@shop/app-kit/data"
import { CouponFormDialog } from "#/coupon/CouponFormDialog"
import { CouponTable } from "#/coupon/CouponTable"
import { couponListSearchSchema, type CouponListSearch } from "#/coupon/queries"
import { useCouponList } from "#/coupon/use-coupon-list"
import { useT } from "#/locales/use-t"
import { useShop } from "#/shop"

export const Route = createFileRoute("/_app/marketing/coupon")({
    validateSearch: (search: Record<string, unknown>): CouponListSearch =>
        couponListSearchSchema.parse(search),
    component: CouponRoute,
})

// 「没有编辑」提示卡不能删：已领出的券按领取时快照生效，删了卖家会去找那个不存在的编辑按钮
function CouponRoute() {
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const shop = useShop()
    const t = useT("coupon")
    const { rows, total, isPending, busyId, stop } = useCouponList(shop.id, search)
    const [formOpen, setFormOpen] = useState(false)

    useOutOfRangePageGuard({
        page: search.page,
        total,
        size: search.size,
        onFix: (page) => void navigate({ search: { page, size: search.size }, replace: true }),
    })

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{t("coupon.page.intro")}</p>
                <Button onClick={() => setFormOpen(true)}>
                    <Plus className="size-4" />
                    {t("coupon.page.create")}
                </Button>
            </div>

            <Card size="sm">
                <CardContent className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm text-muted-foreground">{t("coupon.page.noEditNotice")}</p>
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
                        <EmptyTitle>{t("coupon.page.empty.title")}</EmptyTitle>
                        <EmptyDescription>{t("coupon.page.empty.description")}</EmptyDescription>
                        <Button
                            className="mt-2"
                            onClick={() => setFormOpen(true)}
                        >
                            {t("coupon.page.create")}
                        </Button>
                    </EmptyHeader>
                </Empty>
            ) : (
                <CouponTable
                    rows={rows}
                    page={search.page}
                    pageSize={search.size}
                    total={total ?? 0}
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
