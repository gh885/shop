import { deriveCartItemView, type CartItem } from "./cart"
import type { CartItemActions } from "./queries"
import { Minus, Plus } from "lucide-react"

import { fenToYuan } from "@shop/api"
import { useState } from "react"
import { notify } from "@shop/app-kit"
import {
    Item,
    Checkbox,
    ItemMedia,
    ItemContent,
    Badge,
    ItemTitle,
    ItemDescription,
    ItemActions,
    ButtonGroup,
    Button,
    ButtonGroupText,
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
    Spinner,
} from "@shop/ui-web"

/**
 * 购物车条目行：勾选框 + 主图 + 标题/规格 + 价格 + 数量步进 + 操作（移入收藏/删除）。
 * 失效条目（available=false）整行置灰、禁操作；stock=0 标缺货。
 * 视图派生（image/title/stock/缺货/置灰）来自 ./cart.ts，动作由上层传入 actions（一份实例供整组共用）。
 */
export function ItemRow({ item, actions }: { item: CartItem; actions: CartItemActions }) {
    const view = deriveCartItemView(item)
    const [confirmOpen, setConfirmOpen] = useState(false)

    return (
        <Item
            className={`flex-nowrap gap-4 py-5 ${view.disabled ? "opacity-50" : ""}`}
            data-testid={`cart-item-${item.id}`}
        >
            <Checkbox
                checked={item.selected}
                disabled={view.disabled}
                onCheckedChange={(checked) => actions.toggleItem(item.id, checked)}
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
                {item.sku.name && <ItemDescription>{item.sku.name}</ItemDescription>}
                {view.outOfStock && <Badge variant="warning">缺货</Badge>}
            </ItemContent>

            <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                    ¥{fenToYuan(item.sku.price.amount)}
                </p>
                <p className="text-xs text-muted-foreground line-through">
                    ¥{fenToYuan(item.sku.originalPrice.amount)}
                </p>
            </div>

            <ItemActions>
                <ButtonGroup>
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
                    <ButtonGroupText className="w-8 justify-center border-x bg-background px-0 text-sm tabular-nums">
                        {item.quantity}
                    </ButtonGroupText>
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
                </ButtonGroup>
            </ItemActions>

            <div className="flex w-24 flex-col items-start gap-1">
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={view.disabled}
                    onClick={() => notify.info("移入收藏功能即将上线")}
                >
                    移入收藏
                </Button>
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={view.disabled}
                    onClick={() => setConfirmOpen(true)}
                >
                    删除
                </Button>
            </div>

            {/* 删除确认 */}
            <AlertDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除商品</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定从购物车删除「{view.title}」吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={actions.removingId === item.id}
                            onClick={() => {
                                actions.removeItem(item.id)
                                setConfirmOpen(false)
                            }}
                        >
                            {actions.removingId === item.id && <Spinner />}删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Item>
    )
}
