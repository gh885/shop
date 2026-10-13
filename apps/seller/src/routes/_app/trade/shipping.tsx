import { createFileRoute } from "@tanstack/react-router"
import { Skeleton } from "@shop/ui-web"

import { ShippingTemplatePage } from "#/shipping"

export const Route = createFileRoute("/_app/trade/shipping")({
    component: ShippingTemplatePage,
    pendingComponent: ShippingTemplatePending,
})

/** 模板是本页主体数据：suspense 加载中整页由路由边界兜骨架（useSuspenseQuery 在页面顶层挂起） */
function ShippingTemplatePending() {
    return (
        <div className="mx-auto w-full max-w-narrow space-y-4">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-44 w-full rounded-lg" />
            <Skeleton className="h-44 w-full rounded-lg" />
        </div>
    )
}
