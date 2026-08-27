import { Link } from "@tanstack/react-router"

import { cn, Checkbox } from "@shop/ui-web"

import { fenToYuan } from "@shop/api"

/**
 * 收藏商品卡片（京东式收藏）：竖版图 + 两行标题 + 收藏人数 + 价格。
 *
 * 收藏列表页专用，与购物车/首页商品卡不同：多一个「N 人收藏」行，
 * 且批量模式下左侧叠加选择框（不移除卡片默认跳详情行为）。
 */

export interface FavoriteCardData {
    id: string
    image: string
    title: string
    /** 收藏人数（后端返回聚合值） */
    collectCount: number
    /** 价格（分） */
    price: number
}

export interface FavoriteCardProps {
    favorite: FavoriteCardData
    /** 批量管理模式：显示选择框 */
    batchMode?: boolean
    /** 当前是否选中（批量选中的受控态） */
    selected?: boolean
    onToggleSelect?: (id: string) => void
}

/** 人数展示：>=10000 转「x.x万」，>=1000 转「x.x千」，否则原样。与截图「1000+人收藏」文案对齐 */
function collectText(count: number): string {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万人收藏`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}千人收藏`
    return `${count}人收藏`
}

export function FavoriteCard({
    favorite,
    batchMode = false,
    selected = false,
    onToggleSelect,
}: FavoriteCardProps) {
    return (
        <Link
            to="/products/$id"
            params={{ id: favorite.id }}
            className="group relative flex w-60 shrink-0 flex-col overflow-hidden rounded-lg bg-background transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
        >
            {/* 批量模式下左上角选择框；点击不触发卡片跳转 */}
            {batchMode && (
                <button
                    type="button"
                    aria-label={`选择 ${favorite.title}`}
                    aria-pressed={selected}
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onToggleSelect?.(favorite.id)
                    }}
                    className="absolute top-2 left-2 z-10 grid size-7 place-content-center rounded-md"
                >
                    <Checkbox
                        checked={selected}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                    />
                </button>
            )}

            {/* 图片：方形 240×240，无图灰底占位 */}
            <div className="relative overflow-hidden rounded-lg bg-white">
                {favorite.image ? (
                    <img
                        src={favorite.image}
                        alt={favorite.title}
                        loading="lazy"
                        className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                        暂无图片
                    </div>
                )}
            </div>

            <div className="flex flex-col px-2 pt-2.5 pb-3">
                {/* 标题：两行截断 */}
                <p className="line-clamp-2 min-h-11 text-sm leading-snug text-foreground transition-colors group-hover:text-primary">
                    {favorite.title}
                </p>

                {/* 收藏人数 */}
                <p className="mt-1.5 text-xs text-muted-foreground">
                    {collectText(favorite.collectCount)}
                </p>

                {/* 价格 */}
                <p className={cn("mt-1 text-base font-bold text-primary tabular-nums")}>
                    ¥{fenToYuan(favorite.price)}
                </p>
            </div>
        </Link>
    )
}
