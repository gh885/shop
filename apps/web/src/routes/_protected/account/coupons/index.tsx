import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert, TicketPercent } from "lucide-react"

import { couponStatusLabel } from "@shop/common"
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
    groupByStatus,
    myCouponsOptions,
    useMyCoupons,
} from "#/coupon"
import type { CouponTab } from "#/coupon"
import { noop } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/account/coupons/")({
    // 客户端预热（受保护页 SSR 服务端拿不到 token，loader 在服务端直接跳过，见 _protected/route.tsx）：
    // 只预取默认 UNUSED 页签第一页；切页签/翻页是新 queryKey，由组件侧按需拉取。
    // query() 失败会 reject —— 预热而已，吞掉；错误仍由组件侧的就地错误态处理。
    loader: ({ context }) => {
        if (import.meta.env.SSR) return
        void context.queryClient.query(myCouponsOptions("UNUSED", 1)).catch(noop)
    },
    component: CouponsPage,
    head: () => ({
        meta: [{ title: "我的优惠券 - 个人中心 - Shop" }],
    }),
})

/**
 * 我的券包：状态页签（服务端按 status 筛选）+ 分页 + 三态。
 * 逻辑（投影/分组/页签定义/请求）全在 `#/coupon` 域里，这里只组装与渲染。
 */
// oxlint-disable-next-line react-doctor/no-high-complexity-react-function -- 页面四态渲染 + 页签/分组/分页组装是页面刻意结构，逻辑（投影/分组/请求）全在 #/coupon 域；拆分需传 6+ props 的宽接口
function CouponsPage() {
    const [tab, setTab] = useState<CouponTab>("UNUSED")
    const [page, setPage] = useState(1)
    const navigate = useNavigate()
    const { data, isLoading, isError, refetch } = useMyCoupons(tab, page)

    const coupons = data?.records ?? []
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / COUPON_PAGE_SIZE))
    const groups = groupByStatus(coupons)

    return (
        <div className="space-y-4">
            <h1 className="text-xl font-bold">我的优惠券</h1>

            {/* 页签：ui-web Tabs（BaseUI）自带方向键切换与 roving tabindex，不手搓 div 按钮 */}
            <Tabs
                value={tab}
                onValueChange={(value) => {
                    const next = COUPON_TABS.find((t) => t.value === value)?.value
                    if (!next) return
                    setTab(next)
                    // 换页签回到第一页：停在第 3 页看另一类券，多半会落进空列表
                    setPage(1)
                }}
            >
                <TabsList
                    variant="line"
                    className="min-h-10"
                >
                    {COUPON_TABS.map((t) => (
                        <TabsTrigger
                            key={t.value}
                            value={t.value}
                            size="lg"
                        >
                            {t.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent
                    value={tab}
                    className="mt-4 space-y-4"
                >
                    {isLoading ? (
                        <div className="space-y-3">
                            {/* 占位骨架：数据未到，无稳定 key 可用，index 合法 */}
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton
                                    /* eslint-disable-next-line react/no-array-index-key, react-doctor/no-array-index-key */
                                    key={i}
                                    className="h-24 w-full rounded-lg"
                                />
                            ))}
                        </div>
                    ) : isError ? (
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
                                    onClick={() => void refetch()}
                                >
                                    重新加载
                                </Button>
                            </EmptyHeader>
                        </Empty>
                    ) : coupons.length === 0 ? (
                        <Empty className="py-16">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <TicketPercent />
                                </EmptyMedia>
                                <EmptyTitle>暂无{couponStatusLabel(tab)}的优惠券</EmptyTitle>
                                <EmptyDescription>去逛逛，看看店铺里的优惠券吧。</EmptyDescription>
                                <Button
                                    className="mt-2"
                                    onClick={() => void navigate({ to: "/" })}
                                >
                                    去逛逛
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
                                            {couponStatusLabel(group.status)}
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
                                    aria-label="分页"
                                >
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious
                                                text="上一页"
                                                aria-label="上一页"
                                                aria-disabled={page <= 1}

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
                                                第 {page} / {totalPages} 页
                                            </span>
                                        </PaginationItem>
                                        <PaginationItem>
                                            <PaginationNext
                                                text="下一页"
                                                aria-label="下一页"
                                                aria-disabled={page >= totalPages}

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
