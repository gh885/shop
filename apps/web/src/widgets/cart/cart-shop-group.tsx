import { Checkbox } from "@shop/ui-web"

import type { CartShopGroup } from "#/entities/cart"
import { useCart } from "#/features/cart/cart-provider"

import { CartItemRow } from "./cart-item-row"

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
