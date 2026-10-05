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

/** 合成根：headless-tree 要一个 rootItemId，而类目树是多根的；它自己不渲染，只在取子项时被用到。
 * 名字是用户可见文案（兜底当子项时也会露出），由调用方按当前语言传进来。 */
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
    /** 展开态由页面持有：新建子类目后要把它爹展开，而展开态只在 initialState 生效过 */
    expandedIds: string[]
    onSelect: (id: string | undefined) => void
    onExpandedChange: (ids: string[]) => void
}

/**
 * 类目树（reui Tree + headless-tree）。
 *
 * 注册四个 feature：`syncDataLoader`（整棵树一次拉全，不分页不懒加载）、`selection`（选中联动右栏）、
 * `hotkeysCore`（方向键/Home/End 在树里走）、`dragAndDrop`（同级换位）。
 *
 * 选中态与展开态都是**受控**的（`state` + `setXxx`）：选中要双向联动右栏，展开要能在新建后
 * 主动展开父级——这两个都不能只放在组件内部。
 */
export function CategoryTree({
    index,
    selectedId,
    expandedIds,
    onSelect,
    onExpandedChange,
}: CategoryTreeProps) {
    /* headless-tree 的 `getItems()` 是「builder 调用」：状态挂在 tree 实例上，而实例身份不变，
       于是编译器把这行 JSX 连同读取一起缓存住——树上永远只有首帧那几条（实测：整棵树空着）。
       reui 的 cascader-virtual（`getVirtualItems()`）与 data-grid（`row.getIsSelected()`）是同一类
       bail，指令写法照抄那两处；没挂编译器的环境（如 vitest）里它是空转。 */
    "use no memo"
    const t = useT()
    const reorder = useReorderCategories()
    const rootItem = useMemo(() => makeRootItem(t("admin.category.tree.root")), [t])

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
        /**
         * 只放行同级换位。跨父级一律不成：parentId 创建后不可改（PUT 也没有这一格），
         * 放行只会让人看见「拖过去又弹回来」——不如一开始就不亮落点。
         */
        canDrop: (dragItems, target) => {
            const parentId = dragItems[0]?.getParent()?.getId()
            if (!parentId) return false
            if (dragItems.some((item) => item.getParent()?.getId() !== parentId)) return false
            if (target.item.getId() === parentId) {
                // 落到父节点身上 = 成为它的子项，父级还能再挂一层才允许（层级上限见 tree.ts 的同一个数）
                return canNestUnder(target.item.getItemData().level)
            }
            return target.item.getParent()?.getId() === parentId
        },
        // 拖拽落点同样只是「新的同级顺序」：交给与上下移同一个 orderUpdates 算 sort
        // （新的父级由 canDrop 钉死为原来那个，所以这里只用到 newChildren）
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
                            <Badge variant="outline">{t("admin.category.status.DISABLED")}</Badge>
                        )}
                    </TreeItemLabel>
                </TreeItem>
            ))}
            <TreeDragLine />
        </Tree>
    )
}
