import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import { TicketPercent } from "lucide-react"

import {
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
    Skeleton,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@shop/ui-web"

import {
    COUPON_PAGE_SIZE,
    COUPON_TABS,
    CouponCard,
    couponStatusMeta,
    groupByStatus,
    myCouponsOptions,
} from "#/domains/coupon"
import type { CouponTab } from "#/domains/coupon"
import { noop, useQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_authenticated/account/coupons/")({
    loader: ({ context }) => {
        if (import.meta.env.SSR) return
        void context.queryClient.query(myCouponsOptions("UNUSED", 1)).catch(noop)
    },
    component: CouponsPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.coupons", match.context.locale) }],
    }),
})

// oxlint-disable-next-line react-doctor/no-high-complexity-react-function -- 页面四态渲染 + 页签/分组/分页组装是页面刻意结构，逻辑（投影/分组/请求）全在 #/coupon 域；拆分需传 6+ props 的宽接口
function CouponsPage() {
    const [tab, setTab] = useState<CouponTab>("UNUSED")
    const [page, setPage] = useState(1)
    const navigate = useNavigate()
    const t = useT()
    const { data, isLoading } = useQuery(myCouponsOptions(tab, page))

    const statusLabel = (status: string) => {
        const key = couponStatusMeta(status).labelKey
        return key ? t(key) : status
    }

    const coupons = data?.records ?? []
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / COUPON_PAGE_SIZE))
    const groups = groupByStatus(coupons)

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("account.menu.coupons")}</h2>

            <Tabs
                value={tab}
                onValueChange={(value) => {
                    const next = COUPON_TABS.find((opt) => opt.value === value)?.value
                    if (!next) return
                    setTab(next)
                    setPage(1)
                }}
            >
                <TabsList
                    variant="line"
                    className="min-h-10"
                >
                    {COUPON_TABS.map((opt) => (
                        <TabsTrigger
                            key={opt.value}
                            value={opt.value}
                            size="lg"
                        >
                            {t(opt.labelKey)}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent
                    value={tab}
                    className="mt-4 space-y-4"
                >
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton
                                    /* eslint-disable-next-line react/no-array-index-key, react-doctor/no-array-index-key */
                                    key={i}
                                    className="h-24 w-full rounded-lg"
                                />
                            ))}
                        </div>
                    ) : coupons.length === 0 ? (
                        <Empty className="py-16">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <TicketPercent />
                                </EmptyMedia>
                                <EmptyTitle>
                                    {t("account.coupons.emptyTitle", {
                                        status: statusLabel(tab),
                                    })}
                                </EmptyTitle>
                                <EmptyDescription>
                                    {t("account.coupons.emptyDescription")}
                                </EmptyDescription>
                                <Button
                                    className="mt-2"
                                    onClick={() => void navigate({ to: "/" })}
                                >
                                    {t("account.empty.browse")}
                                </Button>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <>
                            {groups.map((group) => (
                                <section
                                    key={group.status}
                                    className="space-y-3"
                                >
                                    {/* 分组标题只在同页混状态时出现（「未使用」页签在后端同时收 LOCKED/结算中） */}
                                    {groups.length > 1 && (
                                        <h2 className="text-sm font-medium text-muted-foreground">
                                            {statusLabel(group.status)}
                                        </h2>
                                    )}
                                    <div className="space-y-3">
                                        {group.coupons.map((coupon) => (
                                            <CouponCard
                                                key={coupon.id}
                                                coupon={coupon}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}

                            {totalPages > 1 && (
                                <Pagination
                                    className="mx-0 justify-center"
                                    aria-label={t("account.coupons.pagination.aria")}
                                >
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious
                                                text={t("account.coupons.pagination.previousText")}
                                                aria-label={t(
                                                    "account.coupons.pagination.previousAria",
                                                )}
                                                disabled={page <= 1}

                                                // href 只为让 <a> 可聚焦可回车；跳转由 onClick 接管（分页是本地状态，不是路由）
                                                href={page > 1 ? "#" : undefined}
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    if (page > 1) setPage(page - 1)
                                                }}
                                            />
                                        </PaginationItem>
                                        <PaginationItem>
                                            <span className="px-3 text-sm text-muted-foreground tabular-nums">
                                                {t("account.coupons.pagination.info", {
                                                    page,
                                                    totalPages,
                                                })}
                                            </span>
                                        </PaginationItem>
                                        <PaginationItem>
                                            <PaginationNext
                                                text={t("account.coupons.pagination.nextText")}
                                                aria-label={t(
                                                    "account.coupons.pagination.nextAria",
                                                )}
                                                disabled={page >= totalPages}

                                                href={page < totalPages ? "#" : undefined}
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    if (page < totalPages) setPage(page + 1)
                                                }}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            )}
                        </>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
