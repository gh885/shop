import { useState } from "react"
import { ChevronRight, Search } from "lucide-react"
import { cn, InputGroup, InputGroupAddon, InputGroupInput } from "@shop/ui-web"

import { columnsOf, filterByName, isLeaf } from "#/product/category"
import { useT } from "#/locales/use-t"
import type { CategoryNode } from "@shop/api/sdk"

/** 类目最多三级（后端 CategoryService.MAX_LEVEL），列位固定摆满，避免选之前只有孤零零一列 */
const COLUMN_SLOTS = [0, 1, 2]

/**
 * 类目级联列（千牛式）：三列定宽常驻，未解锁的列显示空态占位。
 * 列与列靠底色分块（浅灰工作区 + 白色列面）区隔，不描边框。
 * 组件无派生状态：列由 selectedIds 推导（columnsOf），只负责画和回调。
 */
export function CategoryColumns({
    tree,
    selectedIds,
    onSelect,
}: {
    tree: CategoryNode[]
    selectedIds: string[]
    onSelect: (column: number, id: string) => void
}) {
    const t = useT("product")
    const columns = columnsOf(tree, selectedIds)
    // columnsOf 在末级处停止出列：列数与已选层数相等 = 已经选到末级
    const reachedLeaf = selectedIds.length > 0 && columns.length === selectedIds.length

    return (
        <div className="flex h-115 gap-2">
            {COLUMN_SLOTS.map((slot) => {
                const nodes = columns[slot]
                return nodes ? (
                    <CategoryColumn
                        key={selectedIds[slot - 1] ?? "root"}
                        nodes={nodes}
                        selectedId={selectedIds[slot]}
                        onSelect={(id) => onSelect(slot, id)}
                    />
                ) : (
                    <EmptyColumn
                        key={`slot-${slot}`}
                        text={
                            reachedLeaf
                                ? t("product.category.col.reachedLeaf")
                                : t("product.category.col.needParent")
                        }
                    />
                )
            })}
        </div>
    )
}

function CategoryColumn({
    nodes,
    selectedId,
    onSelect,
}: {
    nodes: CategoryNode[]
    selectedId?: string
    onSelect: (id: string) => void
}) {
    const t = useT("product")
    const [keyword, setKeyword] = useState("")
    const visible = filterByName(nodes, keyword)

    return (
        <div className="flex min-w-0 flex-1 flex-col rounded-xl bg-background">
            <div className="p-2">
                <InputGroup variant="filled">
                    <InputGroupAddon align="inline-start">
                        <Search className="size-3.5 text-muted-foreground" />
                    </InputGroupAddon>
                    <InputGroupInput
                        type="search"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder={t("product.category.col.filterPlaceholder")}
                        aria-label={t("product.category.col.filterAria")}
                    />
                </InputGroup>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
                {visible.length === 0 ? (
                    <li className="px-2 py-2 text-sm text-muted-foreground">
                        {t("product.category.col.noMatch")}
                    </li>
                ) : (
                    visible.map((node) => (
                        <li key={node.id}>
                            <button
                                type="button"
                                aria-pressed={node.id === selectedId}
                                onClick={() => onSelect(node.id)}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-hidden transition-colors",
                                    "hover:bg-muted focus-visible:bg-muted",
                                    node.id === selectedId &&
                                        "bg-accent font-medium text-foreground hover:bg-accent",
                                )}
                            >
                                <span
                                    className="min-w-0 flex-1 truncate"
                                    title={node.name}
                                >
                                    {node.name}
                                </span>
                                {!isLeaf(node) && (
                                    <ChevronRight
                                        className={cn(
                                            "size-3.5 shrink-0 text-muted-foreground/70",
                                            node.id === selectedId && "text-foreground",
                                        )}
                                    />
                                )}
                            </button>
                        </li>
                    ))
                )}
            </ul>
        </div>
    )
}

/** 未解锁的列位：保持三列骨架，用更浅的底色示意「还不能选」 */
function EmptyColumn({ text }: { text: string }) {
    return (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-xl bg-background/50 text-sm text-muted-foreground/70">
            {text}
        </div>
    )
}
