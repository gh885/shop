import { Button, Separator } from "@shop/ui-web"

import { fenToYuan } from "@shop/api"
import { deriveCartItemView, deriveSelectedItems, deriveSelectedTotal } from "./cart"
import { useCartItems, useToggleCartItem } from "./use-cart"
import { notify } from "#/shared/lib/toast"

/**
 * 购物车右栏结算明细（对齐参考图，但本期不做优惠/红包/满减）：
 * 选中商品缩略图（hover 取消选择）→ 商品总价 → 合计 → 去结算按钮。
 * 派生（selectedItems/total）来自 ./cart.ts 纯函数，这里只负责展示。
 */
export function Settlement() {
    const { data: items } = useCartItems()
    const toggle = useToggleCartItem()
    const selectedItems = deriveSelectedItems(items ?? [])
    const selectedCount = selectedItems.length
    const selectedTotal = deriveSelectedTotal(selectedItems)

    return (
        <div className="rounded-2xl bg-background p-6 ring-1 ring-border/60">
            {/* 标题 */}
            <h2 className="text-lg font-semibold text-foreground">结算明细</h2>

            {/* 选中商品缩略图：hover 显示「取消选择」 */}
            {selectedCount > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {selectedItems.slice(0, 4).map((item) => {
                        const view = deriveCartItemView(item)
                        return (
                            <div
                                key={item.id}
                                className="group relative size-16 overflow-hidden rounded-md"
                            >
                                <img
                                    src={view.image}
                                    alt={view.title}
                                    className="size-full object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggle.mutate({ id: item.id, selected: false })}
                                    aria-label={`取消选择 ${view.title}`}
                                    className="absolute inset-0 hidden items-center justify-center bg-black/50 text-xs text-white group-hover:flex"
                                >
                                    取消选择
                                </button>
                            </div>
                        )
                    })}
                    {selectedCount > 4 && (
                        <span className="flex size-16 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
                            +{selectedCount - 4}
                        </span>
                    )}
                </div>
            )}

            {/* 商品总价 */}
            <div className="mt-5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">商品总价</span>
                <span className="font-medium text-foreground">¥{fenToYuan(selectedTotal)}</span>
            </div>

            {/* 优惠/满减/红包区：本期不做，留白给后续订单接入 */}
            {/* 合计 */}
            <Separator className="mt-6" />
            <div className="mt-4 flex items-end justify-between">
                <span className="text-sm text-muted-foreground">合计：</span>
                <div className="text-right">
                    <span className="text-2xl font-bold tracking-tight text-primary">
                        ¥{fenToYuan(selectedTotal)}
                    </span>
                </div>
            </div>

            {/* 去结算 */}
            <Button
                disabled={selectedCount === 0}
                onClick={() => notify.info("下单功能即将上线")}
                className="mt-5 h-12 w-full rounded-xl bg-linear-to-r from-primary to-primary-hover text-base text-white hover:from-primary-hover hover:to-primary-active"
            >
                去结算{selectedCount > 0 ? `(${selectedCount})` : ""}
            </Button>
        </div>
    )
}
