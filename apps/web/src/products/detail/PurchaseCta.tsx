import { Heart, ShoppingCart } from "lucide-react"

import { useNavigate } from "@tanstack/react-router"

import { useAddToCart } from "#/cart"
import { useFavoriteStatus, useToggleFavorite } from "#/favorite"
import { findMatchingSku, isSelectionComplete, type SkuSelection } from "../product"
import type { ProductDetail } from "../product"
import { useIsLoggedIn, openLoginDialog } from "#/shared/api/auth"
import { Button, Spinner } from "@shop/ui-web"

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
    const { data: favorited = false } = useFavoriteStatus(detail.product.id)
    const toggleFavorite = useToggleFavorite(detail.product.id)

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

    /** 收藏开关：登录后按点击前状态 toggle（判定 add/remove 的方向） */
    function handleFavorite() {
        if (!ensureLogin()) return
        toggleFavorite.mutate(favorited)
    }

    return (
        <div className="rounded-3xl bg-background p-3 shadow-float">
            <div className="flex items-stretch gap-3">
                <Button
                    variant="cta-alt"
                    onClick={handleAdd}
                    className="h-12 w-28 flex-none gap-2"
                >
                    <ShoppingCart className="size-5" />
                    {addToCart.isPending && <Spinner />}加购
                </Button>
                <Button
                    variant="cta"
                    onClick={handleBuyNow}
                    className="h-12 flex-1"
                >
                    立即购买
                </Button>
                <Button
                    variant="outline"
                    aria-label={favorited ? "取消收藏" : "收藏"}
                    aria-pressed={favorited}
                    onClick={handleFavorite}
                    className={`h-12 w-12 rounded-xl ${
                        favorited
                            ? "border-foreground/50 text-foreground"
                            : "text-muted-foreground hover:border-primary/50 hover:bg-transparent hover:text-primary"
                    }`}
                >
                    <Heart className={`size-5 ${favorited ? "fill-foreground" : ""}`} />
                </Button>
            </div>

            {!complete && (
                <p className="mt-2 text-center text-xs text-muted-foreground">请先选择完整规格</p>
            )}
        </div>
    )
}
