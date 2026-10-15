import { useMemo } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, Skeleton, TrendChart } from "@shop/ui-web"

import { dailySalesOptions } from "#/analytics/queries"
import { toTrendPoints } from "#/analytics/daily-sales"
import { useT } from "#/locales/use-t"
import { useShop } from "#/shop"

export const Route = createFileRoute("/_app/analytics")({
    component: AnalyticsPage,
})

function AnalyticsPage() {
    const t = useT("analytics")
    const shop = useShop()
    // 服务端把近 30 个营业日补满（空档日为 0），恒返回 30 点，故无「空」态；失败由全局默认抛给路由错误页
    const { data, isPending } = useQuery(dailySalesOptions(shop.id))

    // points 按引用喂给 TrendChart，它在内部 useMemo 捕获 points 建 definition——
    // 不缓存这层投影会在每次父渲染换一个新数组，连带重画整张 scene
    const points = useMemo(() => toTrendPoints(data ?? []), [data])

    return (
        <div className="max-w-page">
            <Card>
                <CardHeader>
                    <CardTitle>{t("analytics.card.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    {isPending ? (
                        <Skeleton className="h-60 w-full" />
                    ) : (
                        <TrendChart
                            points={points}
                            ariaLabel={t("analytics.chart.aria")}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
