import { Checkbox } from "@shop/ui-web"

import { deriveAllSelected, selectableIdsOf, type CartShopGroup } from "./cart"
import { useCartItemActions, useSelectCartItems } from "./queries"
import { ItemRow } from "./ItemRow"

/**
 * 购物车店铺分组：店铺行整店勾选（批处理）+ 店名 + 组内条目。
 * 组头全选态来自 ./cart.ts 纯派生，行内动作在这里建一份传给 ItemRow（避免 N 行各建 N×3 个 mutation observer）。
 */
export function ShopGroupCard({ group }: { group: CartShopGroup }) {
    const selectItems = useSelectCartItems()
    const actions = useCartItemActions()

    return (
        <section className="border-b border-border/60 last:border-b-0">
            {/* 店铺行 */}
            <div className="flex items-center gap-2 pt-4">
                <Checkbox
                    checked={deriveAllSelected(group.items)}
                    onCheckedChange={(checked) =>
                        selectItems.mutate({
                            itemIds: selectableIdsOf(group),
                            selected: checked === true,
                        })
                    }
                    aria-label={`选择 ${group.shopName} 全部商品`}
                />
                <span className="text-sm font-medium text-foreground">{group.shopName}</span>
            </div>

            {/* 组内条目 */}
            <div className="pl-6">
                {group.items.map((item) => (
                    <ItemRow
                        key={item.id}
                        item={item}
                        actions={actions}
                    />
                ))}
            </div>
        </section>
    )
}
