import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shop/ui-web"

import { setCurrentShopId, useCurrentShop, useMyShops } from "../lib/shop"

/** 顶栏店铺切换器：切换当前经营店铺（X-Shop-Id 上下文），只列 ACTIVE 店铺 */
export function ShopSwitcher() {
    const shops = useMyShops()
    const current = useCurrentShop()

    const actives = shops.data?.filter((s) => s.status === "ACTIVE") ?? []

    if (actives.length === 0) {
        return <span className="text-sm text-muted-foreground">暂无可经营店铺</span>
    }

    return (
        <Select
            value={current?.id ?? ""}
            onValueChange={(value) => setCurrentShopId(value as string)}
        >
            <SelectTrigger className="w-48">
                <SelectValue placeholder="选择店铺" />
            </SelectTrigger>
            <SelectContent>
                {actives.map((shop) => (
                    <SelectItem
                        key={shop.id}
                        value={shop.id}
                    >
                        {shop.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
