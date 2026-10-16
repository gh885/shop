import { cn, Skeleton } from "@shop/ui-web"

import { DETAIL_LAYOUT } from "./constants"
import { DetailColumns } from "#/shared/ui/DetailColumns"

export function ProductDetailSkeleton() {
    return (
        <div className={cn("mx-auto w-full px-6 pb-10", DETAIL_LAYOUT.container)}>
            <div className="mb-4 h-13.5">
                <div className="flex h-full items-center gap-3">
                    <Skeleton className="size-12 shrink-0 rounded-lg" />
                    <Skeleton className="h-5 w-40" />
                </div>
            </div>

            <DetailColumns
                rightWidth={DETAIL_LAYOUT.rightWidth}
                gapClassName={DETAIL_LAYOUT.gap}
                left={
                    <>
                        <Skeleton className="aspect-square w-full rounded-lg lg:aspect-auto lg:h-141" />
                        <Skeleton className="mt-5 h-40 w-full rounded-lg" />
                    </>
                }
                right={
                    <>
                        <div className="flex flex-col gap-4 px-6 py-2">
                            <Skeleton className="h-7 w-3/4" />
                            <Skeleton className="h-11 w-40" />
                            <Skeleton className="h-16 w-full rounded-lg" />
                            <Skeleton className="h-24 w-full rounded-lg" />
                            <Skeleton className="h-9 w-40" />
                        </div>
                        <div className="mt-auto pt-3">
                            <Skeleton className="h-18 w-full rounded-lg" />
                        </div>
                    </>
                }
            />
        </div>
    )
}
