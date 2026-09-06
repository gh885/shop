import { useState } from "react"
import { Search } from "lucide-react"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button,
    Checkbox,
    Spinner,
} from "@shop/ui-web"

import { deriveAllSelected, deriveSelectedItems } from "./cart"
import { useBatchRemoveCartItems, useCartItems, useSelectCartItems } from "./queries"
import { notify } from "#/shared/lib/toast"

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
                <div className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                        checked={deriveAllSelected(items ?? [])}
                        onCheckedChange={(checked) =>
                            selectItems.mutate({ selected: checked === true })
                        }
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
                    disabled={selectedIds.length === 0}
                    onClick={() => setConfirmOpen(true)}
                >
                    删除
                </Button>
            </div>

            {/* 右：筛选 + 车内搜索（占位） */}
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    className="w-24"
                    onClick={() => notify.info("分类筛选即将上线")}
                >
                    分类
                    <span className="text-xs">▾</span>
                </Button>
                <Button
                    variant="outline"
                    className="w-24"
                    onClick={() => notify.info("状态筛选即将上线")}
                >
                    状态
                    <span className="text-xs">▾</span>
                </Button>
                <Button
                    variant="outline"
                    className="w-56"
                    onClick={() => notify.info("车内搜索即将上线")}
                >
                    搜索购物车内商品
                    <Search className="size-4" />
                </Button>
            </div>

            {/* 批量删除二次确认 */}
            <AlertDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除商品</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定从购物车删除选中的 {selectedIds.length} 件商品吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={batchRemove.isPending}
                            onClick={() => batchRemove.mutate(selectedIds)}
                        >
                            {batchRemove.isPending && <Spinner />}删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
