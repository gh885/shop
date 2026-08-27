import { Minus, Plus } from "lucide-react"

import {
    Button,
    Checkbox,
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
} from "@shop/ui-web"
import { fenToYuan } from "@shop/api"

import type { CartItem, CartShopGroup } from "#/entities/cart"
import { useCart } from "#/features/cart"
import { notify } from "#/shared/lib/toast"

/**
 * 购物车店铺分组：店铺行整店勾选（批处理）+ 店名 + 组内条目。
 * 部分选中时 checkbox 半选态；勾选逻辑在 useCart().toggleShop。
 */
export function CartShopGroupCard({ group }: { group: CartShopGroup }) {
    const { toggleShop } = useCart()

    const selectable = group.items.filter((item) => item.available)
    const allSelected = selectable.length > 0 && selectable.every((item) => item.selected)
    const someSelected = selectable.some((item) => item.selected)

    return (
        <section className="border-b border-border/60 last:border-b-0">
            {/* 店铺行 */}
            <div className="flex items-center gap-2 pt-4">
                <Checkbox
                    checked={allSelected}
                    indeterminate={!allSelected && someSelected}
                    onCheckedChange={(checked) => toggleShop(group.shopId, checked === true)}
                    aria-label={`选择 ${group.shopName} 全部商品`}
                />
                <span className="text-sm font-medium text-foreground">{group.shopName}</span>
            </div>

            {/* 组内条目 */}
            <div className="pl-6">
                {group.items.map((item) => (
                    <CartItemRow
                        key={item.id}
                        item={item}
                    />
                ))}
            </div>
        </section>
    )
}

/**
 * 购物车条目行：勾选框 + 主图 + 标题/规格 + 价格 + 数量步进 + 操作（移入收藏/删除）。
 * 失效条目（available=false）整行置灰、禁操作；stock=0 标缺货。
 * 勾选/改数量/删除动作统一走 useCart() 的业务逻辑。
 */
function CartItemRow({ item }: { item: CartItem }) {
    const { toggleItem, updateQuantity, removeItem } = useCart()

    const image = item.sku?.image ?? item.product?.image ?? ""
    const title = item.product?.title ?? "商品已失效"
    const stock = item.sku?.stock ?? 0
    const outOfStock = item.available && stock === 0
    const disabled = !item.available

    return (
        <Item
            className={`flex-nowrap gap-4 py-5 ${disabled ? "opacity-50" : ""}`}
            data-testid={`cart-item-${item.id}`}
        >
            <Checkbox
                checked={item.selected}
                disabled={disabled}
                onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                aria-label={`选择 ${title}`}
            />

            <ItemMedia
                variant="image"
                className="size-20 rounded-lg border border-border/60"
            >
                <img
                    src={image || undefined}
                    alt={title}
                    className="object-cover"
                />
            </ItemMedia>

            <ItemContent>
                <ItemTitle className="line-clamp-2 w-full">{title}</ItemTitle>
                {item.sku?.name && <ItemDescription>{item.sku.name}</ItemDescription>}
                {outOfStock && (
                    <span className="w-fit rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                        缺货
                    </span>
                )}
            </ItemContent>

            <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                    ¥{fenToYuan(item.sku?.price?.amount ?? 0)}
                </p>
                {item.sku?.originalPrice && (
                    <p className="text-xs text-muted-foreground line-through">
                        ¥{fenToYuan(item.sku.originalPrice.amount)}
                    </p>
                )}
            </div>

            <ItemActions className="gap-2">
                <Button
                    variant="outline"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    disabled={disabled || item.quantity <= 1}
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    aria-label="减少数量"
                >
                    <Minus className="size-3.5" />
                </Button>
                <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                <Button
                    variant="outline"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    disabled={disabled || stock === 0}
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    aria-label="增加数量"
                >
                    <Plus className="size-3.5" />
                </Button>
            </ItemActions>

            <div className="flex w-24 flex-col gap-1">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => notify.info("移入收藏功能即将上线")}
                    className="text-xs text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
                >
                    移入收藏
                </button>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                >
                    删除
                </button>
            </div>
        </Item>
    )
}
