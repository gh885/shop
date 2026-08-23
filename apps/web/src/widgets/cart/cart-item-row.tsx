import { Minus, Plus } from "lucide-react"

import { Checkbox } from "@shop/ui-web"

import { formatFen, type CartItem } from "#/entities/cart"
import { useCart } from "#/features/cart/cart-provider"
import { notify } from "#/shared/lib/toast"

/**
 * 购物车条目行：勾选框 + 主图 + 标题/规格 + 价格 + 数量步进 + 操作（移入收藏/删除）。
 * 失效条目（available=false）整行置灰、禁操作；stock=0 标缺货。
 * 勾选/改数量/删除动作统一走 useCart() 的业务逻辑；促销标签后端未出数，本期不渲染。
 */
export function CartItemRow({ item }: { item: CartItem }) {
    const { toggleItem, updateQuantity, removeItem } = useCart()

    const image = item.sku?.image ?? item.product?.image ?? ""
    const title = item.product?.title ?? "商品已失效"
    const stock = item.sku?.stock ?? 0
    const outOfStock = item.available && stock === 0
    const disabled = !item.available

    return (
        <div
            className={`flex items-center gap-4 py-5 ${disabled ? "opacity-50" : ""}`}
            data-testid={`cart-item-${item.id}`}
        >
            <Checkbox
                checked={item.selected}
                onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                disabled={disabled}
                aria-label={`选择 ${title}`}
            />

            {/* 主图 */}
            <div className="size-20 shrink-0 overflow-hidden rounded-md bg-muted">
                {image && (
                    <img
                        src={image}
                        alt={title}
                        className="size-full object-cover"
                    />
                )}
            </div>

            {/* 标题 + 规格 */}
            <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-foreground">{title}</p>
                {item.sku?.name && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {item.sku.name}
                    </p>
                )}
                {disabled && <p className="mt-1 text-xs text-destructive">商品已失效</p>}
                {outOfStock && <p className="mt-1 text-xs text-destructive">缺货</p>}
            </div>

            {/* 价格：现价 + 划线原价 */}
            <div className="w-28 shrink-0 text-right">
                {item.sku?.price ? (
                    <p className="text-sm font-bold text-primary">
                        ¥{formatFen(item.sku.price.amount)}
                    </p>
                ) : (
                    <p className="text-sm text-muted-foreground">暂无价格</p>
                )}
                {item.sku?.originalPrice &&
                    item.sku.price &&
                    item.sku.originalPrice.amount > item.sku.price.amount && (
                        <p className="text-xs text-muted-foreground line-through">
                            ¥{formatFen(item.sku.originalPrice.amount)}
                        </p>
                    )}
            </div>

            {/* 数量步进器：越界/超库存判断在 useCart().updateQuantity 内 */}
            <div className="flex h-8 w-28 shrink-0 items-center overflow-hidden rounded-md border border-border">
                <button
                    type="button"
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    disabled={disabled || item.quantity <= 1}
                    aria-label="减少数量"
                    className="flex h-full flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Minus className="size-3.5" />
                </button>
                <span className="w-10 text-center text-sm">{item.quantity}</span>
                <button
                    type="button"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    disabled={disabled || item.quantity >= 999}
                    aria-label="增加数量"
                    className="flex h-full flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Plus className="size-3.5" />
                </button>
            </div>

            {/* 操作 */}
            <div className="flex w-16 shrink-0 flex-col items-end gap-1">
                <button
                    type="button"
                    onClick={() => notify.info("收藏功能即将上线")}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                    移入收藏
                </button>
                <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                >
                    删除
                </button>
            </div>
        </div>
    )
}
