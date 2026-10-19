import { message } from "#/locales/message"
import { ChevronDown, Search } from "lucide-react"
import { useT } from "#/locales/use-t"
import { useQuery } from "@tanstack/react-query"
import { notify } from "@shop/app-kit/data"
import { Checkbox, Button, confirm, Label } from "@shop/ui-web"
import { deriveSelectedItems, deriveAllSelected } from "./rules"
import { cartItemsOptions, useSelectCartItems, useBatchRemoveCartItems } from "./queries"

export function Toolbar() {
    const t = useT()
    const { data: items } = useQuery(cartItemsOptions)
    const selectItems = useSelectCartItems()
    const batchRemove = useBatchRemoveCartItems()
    const selectedIds = deriveSelectedItems(items ?? []).map((item) => item.id)

    function confirmBatchRemove() {
        void confirm({
            title: t("cart.toolbar.confirmRemove.title"),
            description: t("cart.toolbar.confirmRemove.description", {
                count: selectedIds.length,
            }),
            confirmText: t("cart.toolbar.confirmRemove.confirm"),
            action: () => batchRemove.mutateAsync(selectedIds),
        })
    }

    return (
        <div className="flex h-12 items-center justify-between border-b border-border/60">
            <div className="flex items-center gap-3">
                <Label
                    htmlFor="cart-select-all"
                    className="cursor-pointer"
                >
                    <Checkbox
                        id="cart-select-all"
                        checked={deriveAllSelected(items ?? [])}
                        onCheckedChange={(checked) => selectItems.mutate({ selected: checked })}
                        aria-label={t("cart.toolbar.selectAll")}
                    />
                    <span>{t("cart.toolbar.selectAll")}</span>
                </Label>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.length === 0}
                    onClick={() => notify.info(message("cart.toolbar.soon.favorites"))}
                >
                    {t("cart.toolbar.moveToFavorites")}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.length === 0}
                    onClick={confirmBatchRemove}
                >
                    {t("cart.toolbar.remove")}
                </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    variant="outline"
                    className="min-w-20"
                    onClick={() => notify.info(message("cart.toolbar.soon.category"))}
                >
                    {t("cart.toolbar.category")}
                    <ChevronDown className="size-3.5" />
                </Button>
                <Button
                    variant="outline"
                    className="min-w-20"
                    onClick={() => notify.info(message("cart.toolbar.soon.status"))}
                >
                    {t("cart.toolbar.status")}
                    <ChevronDown className="size-3.5" />
                </Button>
                <Button
                    variant="outline"
                    className="min-w-40 flex-1 max-w-56"
                    onClick={() => notify.info(message("cart.toolbar.soon.search"))}
                >
                    {t("cart.toolbar.searchPlaceholder")}
                    <Search className="size-4" />
                </Button>
            </div>
        </div>
    )
}
