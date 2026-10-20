import { useMemo } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, Skeleton, TrendChart } from "@shop/ui-web"

import { dailySalesOptions } from "#/domains/analytics/queries"
import { toTrendPoints } from "#/domains/analytics/daily-sales"
import { useT } from "#/locales/use-t"
import { useShop } from "#/domains/shop"

export const Route = createFileRoute("/_authenticated/analytics")({
    component: AnalyticsPage,
})

function AnalyticsPage() {
    const t = useT("analytics")
    const shop = useShop()
    const { data, isPending } = useQuery(dailySalesOptions(shop.id))

    // points 必须 useMemo：TrendChart 按引用建 definition，去掉就每次父渲染换数组、重画整张 scene
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
