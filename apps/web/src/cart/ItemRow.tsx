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

import { deriveCartItemView, type CartItem } from "./cart"
import type { CartItemActions } from "./use-cart"
import { notify } from "#/shared/lib/toast"

/**
 * 购物车条目行：勾选框 + 主图 + 标题/规格 + 价格 + 数量步进 + 操作（移入收藏/删除）。
 * 失效条目（available=false）整行置灰、禁操作；stock=0 标缺货。
 * 视图派生（image/title/stock/缺货/置灰）来自 ./cart.ts，动作由上层传入 actions（一份实例供整组共用）。
 */
export function ItemRow({ item, actions }: { item: CartItem; actions: CartItemActions }) {
    const view = deriveCartItemView(item)

    return (
        <Item
            className={`flex-nowrap gap-4 py-5 ${view.disabled ? "opacity-50" : ""}`}
            data-testid={`cart-item-${item.id}`}
        >
            <Checkbox
                checked={item.selected}
                disabled={view.disabled}
                onCheckedChange={(checked) => actions.toggleItem(item.id, checked === true)}
                aria-label={`选择 ${view.title}`}
            />

            <ItemMedia
                variant="image"
                className="size-20 rounded-lg border border-border/60"
            >
                <img
                    src={view.image || undefined}
                    alt={view.title}
                    className="object-cover"
                />
            </ItemMedia>

            <ItemContent>
                <ItemTitle className="line-clamp-2 w-full">{view.title}</ItemTitle>
                {item.sku?.name && <ItemDescription>{item.sku.name}</ItemDescription>}
                {view.outOfStock && (
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
                    disabled={view.disabled || item.quantity <= 1}
                    onClick={() => actions.updateQuantity(item, item.quantity - 1)}
                    aria-label="减少数量"
                >
                    <Minus className="size-3.5" />
                </Button>
                <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                <Button
                    variant="outline"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    disabled={view.disabled || view.stock === 0}
                    onClick={() => actions.updateQuantity(item, item.quantity + 1)}
                    aria-label="增加数量"
                >
                    <Plus className="size-3.5" />
                </Button>
            </ItemActions>

            <div className="flex w-24 flex-col gap-1">
                <button
                    type="button"
                    disabled={view.disabled}
                    onClick={() => notify.info("移入收藏功能即将上线")}
                    className="text-xs text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
                >
                    移入收藏
                </button>
                <button
                    type="button"
                    disabled={view.disabled}
                    onClick={() => actions.removeItem(item.id)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                >
                    删除
                </button>
            </div>
        </Item>
    )
}
