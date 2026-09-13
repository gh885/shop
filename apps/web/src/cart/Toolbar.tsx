import { ChevronDown, Search } from "lucide-react"
import { useState } from "react"
import { notify } from "@shop/app-kit"
import { Checkbox, Button, ConfirmDialog } from "@shop/ui-web"
import { deriveSelectedItems, deriveAllSelected } from "./cart"
import { useCartItems, useSelectCartItems, useBatchRemoveCartItems } from "./queries"

/**
 * 购物车列表工具栏（左栏头部）：全选（读推导的全选态）+ 批量操作 + 车内搜索占位。
 * 分类、状态、搜索本期不做，点击 toast 占位；「删除」二次确认后批量删除已勾选。
 */
export function Toolbar() {
    const { data: items } = useCartItems()
    const selectItems = useSelectCartItems()
    const batchRemove = useBatchRemoveCartItems()
    const [confirmOpen, setConfirmOpen] = useState(false)
    const selectedIds = deriveSelectedItems(items ?? []).map((item) => item.id)

    return (
        <div className="flex h-12 items-center justify-between border-b border-border/60">
            {/* 左：全选 + 批量操作 */}
            <div className="flex items-center gap-3">
                <label
                    htmlFor="cart-select-all"
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                >
                    <Checkbox
                        id="cart-select-all"
                        checked={deriveAllSelected(items ?? [])}
                        onCheckedChange={(checked) => selectItems.mutate({ selected: checked })}
                        aria-label="全选"
                    />
                    <span>全选</span>
                </label>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.length === 0}
                    onClick={() => notify.info("移入收藏功能即将上线")}
                >
                    移入收藏
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.length === 0}
                    onClick={() => setConfirmOpen(true)}
                >
                    删除
                </Button>
            </div>

            {/* 右：筛选 + 车内搜索（占位） */}
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    variant="outline"
                    className="min-w-20"
                    onClick={() => notify.info("分类筛选即将上线")}
                >
                    分类
                    <ChevronDown className="size-3.5" />
                </Button>
                <Button
                    variant="outline"
                    className="min-w-20"
                    onClick={() => notify.info("状态筛选即将上线")}
                >
                    状态
                    <ChevronDown className="size-3.5" />
                </Button>
                <Button
                    variant="outline"
                    className="min-w-40 flex-1 max-w-56"
                    onClick={() => notify.info("车内搜索即将上线")}
                >
                    搜索购物车内商品
                    <Search className="size-4" />
                </Button>
            </div>

            {/* 批量删除二次确认 */}
            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="删除商品"
                description={<>确定从购物车删除选中的 {selectedIds.length} 件商品吗？</>}
                confirmText="删除"
                pending={batchRemove.isPending}
                onConfirm={() => batchRemove.mutate(selectedIds)}
            />
        </div>
    )
}
