import { Link } from "@tanstack/react-router"
import { ConstructionIcon } from "lucide-react"
import { cn } from "@shop/ui-web"

/**
 * 统一占位页：侧边栏二级叶子节点尚未实现的页面（如交易/营销/数据等分组下的条目）。
 * 仅承载占位提示与「返回工作台」，后续接真实页面时替换对应路由。
 * 放在 shared/ui，供各类暂未实现的二级路由复用。
 */
export function PlaceholderPage({ title }: { title?: string }) {
    return (
        <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex size-14 items-center justify-center rounded-lg bg-muted">
                <ConstructionIcon className="size-7 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
                <h1 className="text-lg font-bold tracking-tight">{title ?? "功能建设中"}</h1>
                <p className="text-sm text-muted-foreground">该页面正在紧张开发中，敬请期待。</p>
            </div>
            <Link
                to="/product/list"
                search={{ page: 1, size: 10 }}
                className={cn(
                    "mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-semibold whitespace-nowrap bg-transparent transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 hover:bg-muted hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                )}
            >
                返回商品列表
            </Link>
        </div>
    )
}
