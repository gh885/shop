import { Skeleton } from "@shop/ui-web"

import { FeedSkeleton } from "./Feed"

/**
 * 首页整页挂起骨架：路由 `pendingComponent`，覆盖 **loader 阶段**。这段窗口里若没有 pendingComponent，
 * 库的默认行为是**渲染 null**（`renderPending`，见 `@tanstack/react-router` Match.js）——整块内容消失，
 * 冷缓存下偶发白屏。各区块自己的 `QueryBoundary pending` 只在 loader 已 resolve、组件挂载后才起作用，
 * 覆盖不到这个窗口，所以路由级这一层是必需的。
 */
export function HomeSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="flex w-full flex-col"
        >
            <section className="mx-auto w-full max-w-page px-6 py-6">
                <div className="home-module flex h-50 flex-col gap-4 lg:flex-row">
                    <Skeleton
                        className="h-full w-full rounded-lg lg:w-67 lg:shrink-0"
                        aria-hidden
                    />
                    <Skeleton
                        className="h-full min-w-0 flex-1 rounded-lg"
                        aria-hidden
                    />
                    <Skeleton
                        className="hidden h-full w-62.5 shrink-0 rounded-lg lg:block"
                        aria-hidden
                    />
                </div>
            </section>
            <FeedSkeleton />
        </div>
    )
}
