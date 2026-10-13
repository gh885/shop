import { Skeleton } from "@shop/ui-web"

import { FeedSkeleton } from "./Feed"

/**
 * 首页整页挂起骨架：路由 `pendingComponent`，覆盖 **loader 阶段**（SSR 首屏 / 客户端导航
 * 预取三个 query 的那段时间）。
 *
 * 为什么首页需要它而别的静态页不需要：只有 loader 里 `await` 了取数的路由才可能挂起。
 * 首页 loader 预热导航 / banner / 推荐条（`routes/index.tsx`），这段窗口里若没有 pendingComponent，
 * 库的默认行为是**渲染 null**（`renderPending`，见 `@tanstack/react-router` Match.js）——整块内容消失，
 * 冷缓存下偶发白屏。各区块自己的 `QueryBoundary pending` 只在 loader 已 resolve、组件挂载后才起作用，
 * 覆盖不到这个窗口，所以路由级这一层是必需的。
 *
 * 骨架与首屏真实结构同形：hero 是**一张**白卡（home-module）里三块（导航列 / banner 区 /
 * 用户列，两侧列浅灰 `home-rail`、块间 gap），商品流也是一张白卡——loader resolve 时换皮不换版式。
 * HomeHeader / UserCard 故意不给骨架：HomeHeader 是纯静态（logo + 搜索框，无取数），
 * 它的骨架只会让顶栏在预取窗口里塌一下再弹回（sticky 元素高度变化反而制造 CLS/闪烁），
 * 不如保持真实顶栏在场。
 */
export function HomeSkeleton() {
    return (
        <div
            aria-hidden="true"
            className="flex w-full flex-col"
        >
            {/* 首屏白卡：与 routes/index.tsx 的 hero 面板同一结构（三块 + gap，两侧列浅灰） */}
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
            {/* 商品流骨架 */}
            <FeedSkeleton />
        </div>
    )
}
