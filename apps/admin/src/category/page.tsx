import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"

import { QueryBoundary } from "@shop/app-kit"
import {
    Button,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    FieldTitle,
    Skeleton,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"

import { CategoryTree } from "./category-tree"
import { CategoryDetail, CreateCategoryForm } from "./category-detail"
import { adminCategoryTreeOptions } from "./queries"
import { CATEGORY_ROOT_ID, indexCategoryTree } from "./tree"

/**
 * 类目运维页：左树右详情。
 *
 * 全量树一次拉（后端 `/admin/categories/tree` 含禁用节点、至多三级），所以树上不做懒加载：
 * 树的职责只有「层级 + 选中」，改名/排序/启停/属性模板全在右栏——行内塞一组图标按钮会让
 * 键盘导航与读屏名都变糊。
 *
 * 顺序调整的两个入口（同级上下移、树上拖拽）最终都折成同一份 sort 更新（见 tree.ts 的 orderUpdates）。
 */
export function CategoryPage() {
    const t = useT()
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">类目管理</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    维护商品类目树（最多三级）：改名、同级排序、启用/禁用；三级类目挂属性模板
                </p>
            </div>
            {/* 类目树是整页的原料：失败整块换成错误 UI + 官方 reset（与 seller 选类目同口径） */}
            <QueryBoundary fallback={t("common.loadFailed.categoryTree")}>
                <CategoryWorkspace />
            </QueryBoundary>
        </div>
    )
}

function CategoryWorkspace() {
    const { data, isPending } = useQuery(adminCategoryTreeOptions())
    const index = useMemo(() => indexCategoryTree(data ?? []), [data])

    const [selectedId, setSelectedId] = useState<string>()
    // 展开态由页面持有：新建子类目后要把它爹展开（展开态只在 initialState 生效过一次）
    const [expandedIds, setExpandedIds] = useState<string[]>([CATEGORY_ROOT_ID])
    const [creatingRoot, setCreatingRoot] = useState(false)

    const selected = selectedId ? index.byId[selectedId] : undefined

    function expand(id: string) {
        setExpandedIds((previous) => (previous.includes(id) ? previous : [...previous, id]))
    }

    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <section className="flex h-fit flex-col gap-3 rounded-lg border border-border bg-card p-3 lg:col-span-1">
                <div className="flex items-center justify-between gap-2">
                    <FieldTitle>类目树</FieldTitle>
                    {!creatingRoot && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCreatingRoot(true)}
                        >
                            <PlusIcon data-slot="icon" />
                            一级类目
                        </Button>
                    )}
                </div>

                {creatingRoot && (
                    <CreateCategoryForm
                        index={index}
                        onCreated={(id) => {
                            setSelectedId(id)
                            setCreatingRoot(false)
                        }}
                        onCancel={() => setCreatingRoot(false)}
                    />
                )}

                {isPending ? (
                    <Skeleton className="h-40 w-full" />
                ) : index.childIds[CATEGORY_ROOT_ID]?.length === 0 ? (
                    <Empty className="py-8">
                        <EmptyHeader>
                            <EmptyTitle>还没有类目</EmptyTitle>
                            <EmptyDescription>先建一级类目，再逐级往下挂</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <CategoryTree
                        index={index}
                        selectedId={selectedId}
                        expandedIds={expandedIds}
                        onSelect={setSelectedId}
                        onExpandedChange={setExpandedIds}
                    />
                )}
            </section>

            <section className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
                {selected ? (
                    <CategoryDetail
                        node={selected}
                        index={index}
                        onSelect={setSelectedId}
                        onExpand={expand}
                    />
                ) : (
                    <Empty className="py-12">
                        <EmptyHeader>
                            <EmptyTitle>选一个类目</EmptyTitle>
                            <EmptyDescription>
                                左树点选后，这里改名、调同级顺序、启用/禁用；三级类目带属性模板
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
            </section>
        </div>
    )
}
