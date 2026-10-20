import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { Button, Image, Separator } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { Price } from "#/shared/ui/Price"
import { deriveCartItemView, deriveSelectedItems, deriveSelectedTotal } from "./rules"
import { cartItemsOptions, useToggleCartItem } from "./queries"

export function Settlement() {
    const t = useT("cart")
    const { data: items } = useQuery(cartItemsOptions)
    const toggle = useToggleCartItem()
    const navigate = useNavigate()
    const selectedItems = deriveSelectedItems(items ?? [])
    const selectedCount = selectedItems.length
    const selectedTotal = deriveSelectedTotal(selectedItems)

    const goCheckout = () => {
        const lines = selectedItems.map((i) => ({ skuId: i.skuId, quantity: i.quantity }))
        void navigate({ to: "/checkout", search: { lines } })
    }

    return (
        <div className="rounded-lg bg-background p-6 ring-1 ring-border/60">
            <h2 className="text-lg font-semibold text-foreground">{t("cart.settlement.title")}</h2>

            {selectedCount > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {selectedItems.slice(0, 4).map((item) => {
                        const view = deriveCartItemView(item)
                        return (
                            <div
                                key={item.id}
                                className="group relative size-16 overflow-hidden rounded-md"
                            >
                                <Image
                                    src={view.image}
                                    alt={view.title}
                                    className="size-full"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggle.mutate({ id: item.id, selected: false })}
                                    aria-label={t("cart.settlement.deselectAria", {
                                        title: view.title,
                                    })}
                                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                                >
                                    {t("cart.settlement.deselect")}
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

            <div className="mt-5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("cart.settlement.subtotal")}</span>
                <Price
                    value={selectedTotal}
                    className="text-sm font-medium text-foreground"
                />
            </div>

            <Separator className="mt-6" />
            <div className="mt-4 flex items-end justify-between">
                <span className="text-sm text-muted-foreground">{t("cart.settlement.total")}</span>
                <div className="text-right">
                    <Price
                        value={selectedTotal}
                        className="text-2xl font-bold text-foreground"
                    />
                </div>
            </div>

            <Button
                variant="cta"
                disabled={selectedCount === 0}
                onClick={goCheckout}
                className="mt-5 h-12 w-full"
            >
                {selectedCount > 0
                    ? t("cart.settlement.checkoutWithCount", { count: selectedCount })
                    : t("cart.settlement.checkout")}
            </Button>
        </div>
    )
}
