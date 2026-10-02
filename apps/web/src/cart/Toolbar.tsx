import { ChevronDown, Search } from "lucide-react"
import { useT } from "#/locales/use-t"
import { useQuery } from "@tanstack/react-query"
import { notify } from "@shop/app-kit/data"
import { Checkbox, Button, confirm, Label } from "@shop/ui-web"
import { deriveSelectedItems, deriveAllSelected } from "./cart"
import { cartItemsOptions, useSelectCartItems, useBatchRemoveCartItems } from "./queries"

/**
 * 购物车列表工具栏（左栏头部）：全选（读推导的全选态）+ 批量操作 + 车内搜索占位。
 * 分类、状态、搜索本期不做，点击 toast 占位；「删除」二次确认后批量删除已勾选。
 */
export function Toolbar() {
    const t = useT()
    const { data: items } = useQuery(cartItemsOptions)
    const selectItems = useSelectCartItems()
    const batchRemove = useBatchRemoveCartItems()
    const selectedIds = deriveSelectedItems(items ?? []).map((item) => item.id)

    /** 批量删除二次确认：确认即批量删（乐观更新），失败保持打开等重试 */
    function confirmBatchRemove() {
        void confirm({
            title: t("web.cart.toolbar.confirmRemove.title"),
            description: t("web.cart.toolbar.confirmRemove.description", {
                count: selectedIds.length,
            }),
            confirmText: t("web.cart.toolbar.confirmRemove.confirm"),
            action: () => batchRemove.mutateAsync(selectedIds),
        })
    }

    return (
        <div className="flex h-12 items-center justify-between border-b border-border/60">
            {/* 左：全选 + 批量操作 */}
            <div className="flex items-center gap-3">
                <Label
                    htmlFor="cart-select-all"
                    className="cursor-pointer"
                >
                    <Checkbox
                        id="cart-select-all"
                        checked={deriveAllSelected(items ?? [])}
                        onCheckedChange={(checked) => selectItems.mutate({ selected: checked })}
                        aria-label={t("web.cart.toolbar.selectAll")}
                    />
                    <span>{t("web.cart.toolbar.selectAll")}</span>
                </Label>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.length === 0}
                    onClick={() => notify.info(t("web.cart.toolbar.soon.favorites"))}
                >
                    {t("web.cart.toolbar.moveToFavorites")}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.length === 0}
                    onClick={confirmBatchRemove}
                >
                    {t("web.cart.toolbar.remove")}
                </Button>
            </div>

            {/* 右：筛选 + 车内搜索（占位） */}
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    variant="outline"
                    className="min-w-20"
                    onClick={() => notify.info(t("web.cart.toolbar.soon.category"))}
                >
                    {t("web.cart.toolbar.category")}
                    <ChevronDown className="size-3.5" />
                </Button>
                <Button
                    variant="outline"
                    className="min-w-20"
                    onClick={() => notify.info(t("web.cart.toolbar.soon.status"))}
                >
                    {t("web.cart.toolbar.status")}
                    <ChevronDown className="size-3.5" />
                </Button>
                <Button
                    variant="outline"
                    className="min-w-40 flex-1 max-w-56"
                    onClick={() => notify.info(t("web.cart.toolbar.soon.search"))}
                >
                    {t("web.cart.toolbar.searchPlaceholder")}
                    <Search className="size-4" />
                </Button>
            </div>
        </div>
    )
}
