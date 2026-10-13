import { cn, Skeleton } from "@shop/ui-web"

import { DETAIL_LAYOUT } from "./constants"
import { DetailColumns } from "#/shared/ui/DetailColumns"

/**
 * 详情页 route 级 pending 骨架：客户端导航到详情页、loader 在 `pendingMs` 内没跑完时顶上。
 *
 * 复用真实的 `DetailColumns` 与 `DETAIL_LAYOUT`，所以骨架与真页面的版心/双栏比例一定一致 ——
 * 换到真内容时不跳版。左栏占位取画廊主图框的实际形状：移动端 `aspect-square`、lg 起 `h-141`
 * （对齐天猫 picGallery 564），与 Gallery 里那个框同值。
 */
export function ProductDetailSkeleton() {
    return (
        <div className={cn("mx-auto w-full px-6 pb-10", DETAIL_LAYOUT.container)}>
            {/* 店铺条占位：与里层 h-13.5 的高度约束同形 */}
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
