import { useMemo } from "react"
import {
    createOnDropHandler,
    dragAndDropFeature,
    hotkeysCoreFeature,
    selectionFeature,
    syncDataLoaderFeature,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import type { CategoryNode } from "@shop/api/sdk"

import { Badge, Tree, TreeDragLine, TreeItem, TreeItemLabel } from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { useReorderCategories } from "./queries"
import { CATEGORY_ROOT_ID, canNestUnder, orderUpdates, type CategoryIndex } from "./tree"

// 合成根：headless-tree 缺 rootItemId 直接崩；类目树是多根的，它自己不渲染，只在取子项时被用到
function makeRootItem(name: string): CategoryNode {
    return {
        id: CATEGORY_ROOT_ID,
        parentId: CATEGORY_ROOT_ID,
        name,
        level: 0,
        sort: 0,
        status: "ENABLED",
        iconUrl: null,
        children: [],
    }
}

export interface CategoryTreeProps {
    index: CategoryIndex
    selectedId?: string
    expandedIds: string[]
    onSelect: (id: string | undefined) => void
    onExpandedChange: (ids: string[]) => void
}

export function CategoryTree({
    index,
    selectedId,
    expandedIds,
    onSelect,
    onExpandedChange,
}: CategoryTreeProps) {
    // getItems() 是 builder 调用：实例身份不变会让编译器把它连同读取一起缓存住，树上只剩首帧那几条；reui cascader-virtual/data-grid 同一类 bail。无编译器的环境（vitest）里空转
    "use no memo"
    const t = useT()
    const reorder = useReorderCategories()
    const rootItem = useMemo(() => makeRootItem(t("category.tree.root")), [t])

    const tree = useTree<CategoryNode>({
        rootItemId: CATEGORY_ROOT_ID,
        features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature, dragAndDropFeature],
        dataLoader: {
            getItem: (id) => (id === CATEGORY_ROOT_ID ? rootItem : (index.byId[id] ?? rootItem)),
            getChildren: (id) => [...(index.childIds[id] ?? [])],
        },
        getItemName: (item) => item.getItemData().name,
        isItemFolder: (item) => (index.childIds[item.getId()]?.length ?? 0) > 0,
        state: {
            selectedItems: selectedId ? [selectedId] : [],
            expandedItems: expandedIds,
        },
        setSelectedItems: (updater) => {
            const previous = selectedId ? [selectedId] : []
            const next = typeof updater === "function" ? updater(previous) : updater
            onSelect(next[0])
        },
        setExpandedItems: (updater) => {
            const next = typeof updater === "function" ? updater(expandedIds) : updater
            onExpandedChange(next)
        },
        canReorder: true,
        // 只放行同级换位：parentId 创建后不可改，跨父放行只会「拖过去又弹回来」
        canDrop: (dragItems, target) => {
            const parentId = dragItems[0]?.getParent()?.getId()
            if (!parentId) return false
            if (dragItems.some((item) => item.getParent()?.getId() !== parentId)) return false
            if (target.item.getId() === parentId) {
                return canNestUnder(target.item.getItemData().level)
            }
            return target.item.getParent()?.getId() === parentId
        },
        onDrop: createOnDropHandler((_parent, newChildren) => {
            reorder.mutate(orderUpdates(newChildren, index.byId))
        }),
    })

    return (
        <Tree
            tree={tree}
            indent={16}
            className="max-h-120 min-h-40 overflow-y-auto"
        >
            {tree.getItems().map((item) => (
                <TreeItem
                    key={item.getId()}
                    item={item}
                >
                    <TreeItemLabel>
                        <span className="min-w-0 flex-1 truncate">{item.getItemName()}</span>
                        {item.getItemData().status === "DISABLED" && (
                            <Badge variant="outline">{t("category.status.DISABLED")}</Badge>
                        )}
                    </TreeItemLabel>
                </TreeItem>
            ))}
            <TreeDragLine />
        </Tree>
    )
}
