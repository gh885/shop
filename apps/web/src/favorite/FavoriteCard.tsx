import { useNavigate } from "@tanstack/react-router"
import { Check } from "lucide-react"

import { Item, ItemContent, ItemDescription, ItemHeader, ItemTitle } from "@shop/ui-web"

import { ProductImage } from "#/shared/ui/ProductImage"

import { collectText, type FavoriteItem } from "./favorite"

/**
 * 收藏商品卡片（京东式收藏）：竖版图 + 两行标题 + 收藏人数。
 * 受控组件：卡片内部不改任何状态，行为全靠 props 驱动。
 * - 常规态：点击跳详情；hover 右上角「移出」（onRemove）
 * - 批量态：点击整卡切换选中（onToggleSelect），左上角显示选中角标（selected）
 * （批量选中靠整卡点击切换，不嵌套独立 checkbox，避免 button 里嵌可交互元素）
 */

export interface FavoriteCardProps {
    favorite: FavoriteItem
    /** 批量管理模式：点击切换选中而非跳详情 */
    batchMode?: boolean
    /** 是否选中（受控，按 productId） */
    selected?: boolean
    onToggleSelect?: (productId: string) => void
    /** 移出收藏（hover 操作） */
    onRemove?: (productId: string) => void
}

export function FavoriteCard({
    favorite,
    batchMode = false,
    selected = false,
    onToggleSelect,
    onRemove,
}: FavoriteCardProps) {
    const navigate = useNavigate()

    const handleClick = () => {
        if (batchMode) {
            onToggleSelect?.(favorite.productId)
            return
        }
        void navigate({ to: `/products/${favorite.productId}` })
    }

    return (
        // 容器用 div：避免 button 嵌套 button（键盘/读屏无法区分嵌套可交互控件）；
        // 可点击区域是覆盖卡片的内层 button，「移出」是其兄弟节点
        <div className="group relative block w-60 shrink-0 transition-all duration-200 hover:shadow-lift">
            <button
                type="button"
                onClick={handleClick}
                aria-label={favorite.title}
                className="block w-full cursor-pointer text-left"
            >
                <div className="flex w-full max-w-xl flex-col gap-6">
                    <Item variant="outline">
                        <ItemHeader>
                            <div className="relative">
                                <ProductImage
                                    src={favorite.image}
                                    alt={favorite.title}
                                />
                                {batchMode && selected && (
                                    <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                        <Check className="size-4" />
                                    </span>
                                )}
                            </div>
                        </ItemHeader>
                        <ItemContent>
                            <ItemTitle>{favorite.title}</ItemTitle>
                            <ItemDescription>{collectText(favorite.collectCount)}</ItemDescription>
                        </ItemContent>
                    </Item>
                </div>
            </button>

            {onRemove && !batchMode && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove(favorite.productId)
                    }}
                    className="absolute top-2 right-2 hidden rounded bg-black/50 px-2 py-1 text-xs text-white group-hover:block"
                >
                    移出
                </button>
            )}
        </div>
    )
}
