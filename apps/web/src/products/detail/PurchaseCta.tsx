import { Heart, ShoppingCart } from "lucide-react"

import { useNavigate } from "@tanstack/react-router"

import { useAddToCart } from "#/cart"
import { useFavoriteStatus, useToggleFavorite } from "#/favorite"
import { findMatchingSku, isSelectionComplete, type SkuSelection } from "../product"
import type { ProductDetail } from "../product"
import { useIsLoggedIn, openLoginDialog } from "#/shared/api/auth"
import { useT } from "#/locales/use-t"
import { Button, Spinner, cn } from "@shop/ui-web"

/** 收藏心形：单独抽出来是为了让PurchaseCta 只管加购/下单的编排。
 *  三分状态都在这里收口（游客可点 / 未知暂不可操作 / 已知才切换）。 */
function FavoriteButton({ productId, isLoggedIn }: { productId: string; isLoggedIn: boolean }) {
    const t = useT("product")
    /**
     * 「未知」不能当「未收藏」——`useToggleFavorite` 靠这个值判方向（true→取消、false→收藏），
     * 未知时按 false 发出去就是一次「取消收藏」，会误删用户刚收藏的商品。
     */
    const favorite = useFavoriteStatus(productId)
    const toggleFavorite = useToggleFavorite(productId)
    const favorited = favorite.data
    /** 已登录但状态未知（未到或取失败）：此刻判不了方向，按钮暂不可操作 */
    const unknown = isLoggedIn && favorited === undefined

    function handleClick() {
        // 游客点一下是拉登录框，不是收藏，所以登录判断在前面
        if (!isLoggedIn) {
            openLoginDialog()
            return
        }
        // 状态未知时不给方向，宁可先重试也不猜一个「取消收藏」发出去
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
                favorited
                    ? t("web.product.detail.favorite.remove")
                    : t("web.product.detail.favorite.add")
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

/**
 * 商品动作卡：加购 / 立即购买 / 收藏。
 * 属于详情页右栏内容（不是独立的布局插槽）：与购买面板同处一个 `sticky top-4` 容器，
 * 整块随页面滚动，宽度即右栏轨道宽。规格未选全或已售罄时禁用；加购/下单后端未就绪，先 toast 占位。
 */
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

    /** 未登录先拉起登录框；返回是否已登录（调用方据此决定是否继续动作） */
    function ensureLogin(): boolean {
        if (!isLoggedIn) openLoginDialog()
        return isLoggedIn
    }

    /** 加购：登录后按选中 SKU + 数量加购，成功后跳转购物车 */
    function handleAdd() {
        if (!ensureLogin()) return
        if (!matchedSku) return
        addToCart.mutate(
            { skuId: matchedSku.id, quantity },
            { onSuccess: () => navigate({ to: "/cart" }) },
        )
    }

    /** 立即购买：登录后按选中 SKU + 数量归约成一行结算行跳结算，送达页由结算页承接 */
    function handleBuyNow() {
        if (!ensureLogin()) return
        if (!matchedSku) return
        void navigate({
            to: "/checkout",
            search: { lines: [{ skuId: matchedSku.id, quantity }] },
        })
    }

    return (
        <div className="rounded-xl bg-background p-3 shadow-float">
            <div className="flex items-stretch gap-3">
                <Button
                    variant="cta-alt"
                    onClick={handleAdd}
                    className="h-12 w-28 flex-none"
                >
                    <ShoppingCart className="size-5" />
                    {addToCart.isPending && <Spinner />}
                    {t("web.product.detail.cta.addToCart")}
                </Button>
                <Button
                    variant="cta"
                    onClick={handleBuyNow}
                    className="h-12 flex-1"
                >
                    {t("web.product.detail.cta.buyNow")}
                </Button>
                <FavoriteButton
                    productId={detail.product.id}
                    isLoggedIn={isLoggedIn}
                />
            </div>

            {!complete && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                    {t("web.product.detail.cta.pickSpec")}
                </p>
            )}
        </div>
    )
}
