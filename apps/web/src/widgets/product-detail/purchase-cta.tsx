import { useNavigate } from "@tanstack/react-router"
import { ShoppingCart, Star } from "lucide-react"

import { Button } from "@shop/ui-web"

import { useAddToCart } from "#/features/cart/use-cart"
import {
    findMatchingSku,
    isSelectionComplete,
    type SkuSelection,
} from "#/features/product-detail/model"
import type { ProductDetail } from "#/entities/product"
import { useLoginDialogOpen, useIsLoggedIn } from "#/shared/api/auth"
import { notify } from "#/shared/lib/toast"

/**
 * 商品动作卡：加购 / 立即购买 / 收藏。
 * 由 DetailColumns 的 bottom 插槽承载（sticky bottom 钉视口底、双栏滚完随页滚走），
 * 宽度即右栏轨道宽。规格未选全或已售罄时禁用；加购/下单后端未就绪，先 toast 占位。
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
    const [, setLoginOpen] = useLoginDialogOpen()
    const addToCart = useAddToCart()

    const complete = isSelectionComplete(detail, selection)
    const matchedSku = findMatchingSku(detail.skus, selection)
    /** 选全规格后才有「售罄」概念：命中 SKU 无库存 */
    const soldOut = complete && (matchedSku?.stock ?? 0) <= 0

    /** 加购：未登录先拉起登录框；登录后按选中 SKU + 数量加购，成功后跳转购物车 */
    function handleAdd() {
        if (!isLoggedIn) {
            setLoginOpen(true)
            return
        }
        if (!matchedSku) return
        addToCart.mutate(
            { skuId: matchedSku.id, quantity },
            { onSuccess: () => navigate({ to: "/cart" }) },
        )
    }

    return (
        <div className="rounded-3xl bg-background p-3 shadow-float ring-1 ring-border/60">
            <div className="flex items-stretch gap-3">
                <Button
                    disabled={!complete || soldOut || addToCart.isPending}
                    onClick={handleAdd}
                    className="h-12 w-28 flex-none gap-2 rounded-xl bg-gradient-to-r from-cta-alt to-cta-alt-hover text-base text-white hover:from-cta-alt-hover hover:to-cta-alt-active"
                >
                    <ShoppingCart className="size-5" />
                    {addToCart.isPending ? "加购中…" : "加购"}
                </Button>
                <Button
                    disabled={!complete || soldOut}
                    onClick={() => notify.info("下单功能即将上线")}
                    className="h-12 flex-1 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-base hover:from-primary-hover hover:to-primary-active"
                >
                    立即购买
                </Button>
                <Button
                    variant="outline"
                    aria-label="收藏"
                    onClick={() => notify.info("收藏功能即将上线")}
                    className="h-12 w-12 rounded-xl text-muted-foreground hover:border-primary/50 hover:bg-transparent hover:text-primary"
                >
                    <Star className="size-5" />
                </Button>
            </div>

            {!complete && (
                <p className="mt-2 text-center text-xs text-muted-foreground">请先选择完整规格</p>
            )}
        </div>
    )
}
