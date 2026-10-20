import { useNavigate } from "@tanstack/react-router"
import { Check } from "lucide-react"

import { Image, Item, ItemContent, ItemDescription, ItemHeader, ItemTitle } from "@shop/ui-web"

import { collectCount } from "./display"
import type { FavoriteItem } from "./rules"
import { useT } from "#/locales/use-t"
import { useI18n } from "@shop/app-kit/i18n"

export interface FavoriteCardProps {
    favorite: FavoriteItem
    batchMode?: boolean
    selected?: boolean
    onToggleSelect?: (productId: string) => void
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
    const { locale } = useI18n()
    const t = useT()

    const displayTitle = favorite.deleted ? t("favorite.deletedProduct") : favorite.title

    const handleClick = () => {
        if (batchMode) {
            onToggleSelect?.(favorite.productId)
            return
        }
        void navigate({ to: `/products/${favorite.productId}` })
    }

    return (
        <div className="group relative block w-60 shrink-0 transition-shadow duration-200 hover:shadow-lift">
            <button
                type="button"
                onClick={handleClick}
                aria-label={displayTitle}
                className="block w-full cursor-pointer text-left"
            >
                <div className="flex w-full max-w-xl flex-col gap-6">
                    <Item variant="outline">
                        <ItemHeader>
                            <div className="relative">
                                <Image
                                    src={favorite.image}
                                    alt={displayTitle}
                                    ratio={1}
                                    hoverScale
                                    className="w-full"
                                />
                                {batchMode && selected && (
                                    <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                        <Check className="size-4" />
                                    </span>
                                )}
                            </div>
                        </ItemHeader>
                        <ItemContent>
                            <ItemTitle>{displayTitle}</ItemTitle>
                            <ItemDescription>
                                {t("favorite.collected", {
                                    count: collectCount(favorite.collectCount, locale),
                                })}
                            </ItemDescription>
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
                    /* 常驻透明、hover/聚焦时显现：不能用 hidden（display:none），
                       否则键盘 Tab 永远到不了，触屏更没有 hover */
                    className="absolute top-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100"
                >
                    {t("favorite.remove")}
                </button>
            )}
        </div>
    )
}
