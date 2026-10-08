import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { deriveCartItemView, type CartItem } from "./cart"
import type { CartItemActions } from "./queries"
import { Minus, Plus } from "lucide-react"

import { useI18n } from "@shop/app-kit/i18n"
import { formatMoney } from "@shop/common/domain"
import { notify } from "@shop/app-kit/data"
import { Price } from "#/shared/ui/Price"
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
    confirm,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    Image,
} from "@shop/ui-web"

/**
 * 购物车条目行：勾选框 + 主图 + 标题/规格 + 价格 + 数量步进 + 操作（移入收藏/删除）。
 * 失效条目（available=false）整行置灰、禁操作；stock=0 标缺货。
 * 视图派生（image/title/stock/缺货/置灰）来自 ./cart.ts，动作由上层传入 actions（一份实例供整组共用）。
 */
export function ItemRow({ item, actions }: { item: CartItem; actions: CartItemActions }) {
    const { locale } = useI18n()
    const t = useT("cart")
    const view = deriveCartItemView(item)
    const displayTitle = view.titleKey ? t(view.titleKey) : view.title

    async function removeWithConfirm() {
        const ok = await confirm({
            title: t("cart.item.confirmRemove.title"),
            description: t("cart.item.confirmRemove.description", { title: displayTitle }),
            confirmText: t("cart.item.confirmRemove.confirm"),
        })
        // 乐观更新：点确认即删（列表先行），无需等接口回包
        if (ok) actions.removeItem(item.id)
    }

    return (
        <Item
            size="lg"
            className="flex-nowrap"
            data-disabled={view.disabled || undefined}
            data-testid={`cart-item-${item.id}`}
        >
            <Checkbox
                checked={item.selected}
                disabled={view.disabled}
                onCheckedChange={(checked) => actions.toggleItem(item.id, checked)}
                aria-label={t("cart.item.selectAria", { title: displayTitle })}
            />

            <ItemMedia
                variant="thumbnail"
                className="size-20"
            >
                <Image
                    src={view.image}
                    alt={displayTitle}
                    className="size-full"
                />
            </ItemMedia>

            <ItemContent>
                <ItemTitle
                    lines={2}
                    className="w-full"
                >
                    {displayTitle}
                </ItemTitle>
                {view.skuName && <ItemDescription>{view.skuName}</ItemDescription>}
                {view.outOfStock && <Badge variant="warning">{t("cart.item.outOfStock")}</Badge>}
            </ItemContent>

            {/* 价格：商品/SKU 已删时无价可展示（整行已置灰），不拿假价糊 */}
            <div className="text-right">
                {view.price !== undefined && (
                    <Price
                        value={view.price}
                        className="text-sm text-foreground"
                    />
                )}
                {view.original !== undefined && (
                    <p className="text-xs text-muted-foreground line-through tabular-nums">
                        {formatMoney(view.original, locale)}
                    </p>
                )}
            </div>

            <ItemActions>
                <ButtonGroup>
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    disabled={view.disabled || item.quantity <= 1}
                                    onClick={() => actions.updateQuantity(item, item.quantity - 1)}
                                    aria-label={t("cart.item.decreaseQty")}
                                >
                                    <Minus className="size-3.5" />
                                </Button>
                            }
                        />
                        <TooltipContent>{t("cart.item.decreaseQty")}</TooltipContent>
                    </Tooltip>
                    <ButtonGroupText className="w-8 justify-center border-x bg-background px-0 tabular-nums">
                        {item.quantity}
                    </ButtonGroupText>
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    disabled={view.disabled || view.stock === 0}
                                    onClick={() => actions.updateQuantity(item, item.quantity + 1)}
                                    aria-label={t("cart.item.increaseQty")}
                                >
                                    <Plus className="size-3.5" />
                                </Button>
                            }
                        />
                        <TooltipContent>{t("cart.item.increaseQty")}</TooltipContent>
                    </Tooltip>
                </ButtonGroup>
            </ItemActions>

            <div className="flex w-24 flex-col items-start gap-1">
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={view.disabled}
                    onClick={() => notify.info(message("cart.toolbar.soon.favorites"))}
                >
                    {t("cart.item.moveToFavorites")}
                </Button>
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={view.disabled}
                    onClick={() => {
                        void removeWithConfirm()
                    }}
                >
                    {t("cart.item.remove")}
                </Button>
            </div>
        </Item>
    )
}
