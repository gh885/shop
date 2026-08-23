import { Search } from "lucide-react"

import { Button, Checkbox } from "@shop/ui-web"

import { useCart } from "#/features/cart/cart-provider"
import { notify } from "#/shared/lib/toast"

/**
 * 购物车列表工具栏（左栏头部）：全选（读 useCart 的全选/半选态）+ 批量操作 + 车内搜索占位。
 * 分类、状态、搜索本期不做，点击 toast 占位；「删除」真实执行批量删除已勾选。
 */
export function CartToolbar() {
    const { allSelected, someSelected, toggleAll, removeSelected, selectedCount } = useCart()

    return (
        <div className="flex h-12 items-center justify-between border-b border-border/60">
            {/* 左：全选 + 批量操作 */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onCheckedChange={(checked) => toggleAll(checked === true)}
                        aria-label="全选"
                    />
                    <span>全选</span>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => notify.info("请先勾选商品")}
                >
                    移入收藏
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedCount === 0}
                    onClick={removeSelected}
                >
                    删除
                </Button>
            </div>

            {/* 右：筛选 + 车内搜索（占位） */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => notify.info("分类筛选即将上线")}
                    className="flex h-8 w-24 items-center justify-between rounded-md border border-border bg-background px-3 text-sm text-muted-foreground"
                >
                    分类
                    <span className="text-xs">▾</span>
                </button>
                <button
                    type="button"
                    onClick={() => notify.info("状态筛选即将上线")}
                    className="flex h-8 w-24 items-center justify-between rounded-md border border-border bg-background px-3 text-sm text-muted-foreground"
                >
                    状态
                    <span className="text-xs">▾</span>
                </button>
                <button
                    type="button"
                    onClick={() => notify.info("车内搜索即将上线")}
                    className="flex h-8 w-56 items-center justify-between rounded-md border border-border bg-background px-3 text-sm text-muted-foreground"
                >
                    搜索购物车内商品
                    <Search className="size-4" />
                </button>
            </div>
        </div>
    )
}
