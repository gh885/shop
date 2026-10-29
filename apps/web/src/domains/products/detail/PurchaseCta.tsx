import { Heart, ShoppingCart } from "lucide-react"

import { useNavigate } from "@tanstack/react-router"

import { useAddToCart } from "#/domains/cart"
import { useFavoriteStatus, useToggleFavorite } from "#/domains/favorite"
import { findMatchingSku, isSelectionComplete, type SkuSelection } from "../rules"
import type { ProductDetail } from "../rules"
import { useIsLoggedIn, openLoginDialog } from "#/shared/api/auth"
import { useT } from "#/locales/use-t"
import { Button, Spinner, cn } from "@shop/ui-web"

function FavoriteButton({ spuId, isLoggedIn }: { spuId: string; isLoggedIn: boolean }) {
    const t = useT("product")
    const favorite = useFavoriteStatus(spuId)
    const toggleFavorite = useToggleFavorite(spuId)
    const favorited = favorite.data
    const unknown = isLoggedIn && favorited === undefined

    function handleClick() {
        if (!isLoggedIn) {
            openLoginDialog()
            return
        }
        if (favorited === undefined) {
            void favorite.refetch()
            return
        }
        toggleFavorite.mutate(favorited)
    }

    return (
        <Button
            variant={favorited ? "secondary" : "outline"}
            aria-label={
                favorited ? t("product.detail.favorite.remove") : t("product.detail.favorite.add")
            }
            aria-pressed={favorited}
            disabled={unknown}
            onClick={handleClick}
            className="h-12 w-12"
        >
            <Heart className={cn("size-5", favorited && "fill-foreground")} />
        </Button>
    )
}

export function PurchaseCta({
    detail,
    selection,
    quantity,
}: {
    detail: ProductDetail
    selection: SkuSelection
    quantity: number
}) {
    const navigate = useNavigate()
    const isLoggedIn = useIsLoggedIn()
    const addToCart = useAddToCart()
    const t = useT("product")

    const complete = isSelectionComplete(detail, selection)
    const matchedSku = findMatchingSku(detail.skus, selection)

    function ensureLogin(): boolean {
        if (!isLoggedIn) openLoginDialog()
        return isLoggedIn
    }

    function handleAdd() {
        if (!ensureLogin()) return
        if (!matchedSku) return
        addToCart.mutate(
            { skuId: matchedSku.skuId, quantity },
            { onSuccess: () => navigate({ to: "/cart" }) },
        )
    }

    /**
     * 立即购买：详情契约（ProductSkuView）没有 listingId/merchantId，直构 QuoteLine 会缺参，
     * 所以先入购物车再进结算——结算行由购物车（SkuInfo 带 listingId）补全。
     */
    function handleBuyNow() {
        if (!ensureLogin()) return
        if (!matchedSku) return
        addToCart.mutate(
            { skuId: matchedSku.skuId, quantity },
            { onSuccess: () => navigate({ to: "/cart" }) },
        )
    }

    return (
        <div className="rounded-lg bg-background p-3 shadow-float">
            <div className="flex items-stretch gap-3">
                <Button
                    variant="cta-alt"
                    disabled={addToCart.isPending}
                    onClick={handleAdd}
                    className="h-12 w-28 flex-none"
                >
                    <ShoppingCart className="size-5" />
                    {addToCart.isPending && <Spinner />}
                    {t("product.detail.cta.addToCart")}
                </Button>
                <Button
                    variant="cta"
                    onClick={handleBuyNow}
                    className="h-12 flex-1"
                >
                    {t("product.detail.cta.buyNow")}
                </Button>
                <FavoriteButton
                    spuId={detail.spuId}
                    isLoggedIn={isLoggedIn}
                />
            </div>

            {!complete && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                    {t("product.detail.cta.pickSpec")}
                </p>
            )}
        </div>
    )
}
