import { Checkbox } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { deriveAllSelected, selectableIdsOf, type CartShopGroup } from "./cart"
import { useCartItemActions, useSelectCartItems } from "./queries"
import { ItemRow } from "./ItemRow"

export function ShopGroupCard({ group }: { group: CartShopGroup }) {
    const t = useT("cart")
    const selectItems = useSelectCartItems()
    const actions = useCartItemActions()
    const shopName = group.shopNameKey ? t(group.shopNameKey) : group.shopName

    return (
        <section className="border-b border-border/60 last:border-b-0">
            <div className="flex items-center gap-2 pt-4">
                <Checkbox
                    checked={deriveAllSelected(group.items)}
                    onCheckedChange={(checked) =>
                        selectItems.mutate({
                            itemIds: selectableIdsOf(group),
                            selected: checked,
                        })
                    }
                    aria-label={t("cart.group.selectAllShop", { shopName })}
                />
                <span className="text-sm font-medium text-foreground">{shopName}</span>
            </div>

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
