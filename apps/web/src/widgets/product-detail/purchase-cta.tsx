import { ShoppingCart, Star } from "lucide-react"

import { Button } from "@shop/ui-web"

import { notify } from "#/shared/lib/toast"
import type { ProductDetail } from "#/entities/product"
import {
    findMatchingSku,
    isSelectionComplete,
    type SkuSelection,
} from "#/features/product-detail/model"

/**
 * 商品动作卡：加购 / 立即购买 / 收藏。
 * 由 DetailColumns 的 bottom 插槽承载（sticky bottom 钉视口底、双栏滚完随页滚走），
 * 宽度即右栏轨道宽。规格未选全或已售罄时禁用；加购/下单后端未就绪，先 toast 占位。
 */
export function PurchaseCta({
    detail,
    selection,
}: {
    detail: ProductDetail
    selection: SkuSelection
}) {
    const complete = isSelectionComplete(detail, selection)
    const matchedSku = findMatchingSku(detail.skus, selection)
    /** 选全规格后才有「售罄」概念：命中 SKU 无库存 */
    const soldOut = complete && (matchedSku?.stock ?? 0) <= 0

    return (
        <div className="rounded-3xl bg-background p-3 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.12)] ring-1 ring-border/60">
            <div className="flex items-stretch gap-3">
                <Button
                    disabled={!complete || soldOut}
                    onClick={() => notify.info("购物车功能即将上线")}
                    className="h-12 w-28 flex-none gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-base text-white hover:from-amber-400 hover:to-amber-600"
                >
                    <ShoppingCart className="size-5" />
                    加购
                </Button>
                <Button
                    disabled={!complete || soldOut}
                    onClick={() => notify.info("下单功能即将上线")}
                    className="h-12 flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-primary text-base hover:from-orange-600 hover:to-primary-hover"
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
