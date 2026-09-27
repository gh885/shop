import { useState } from "react"
import type { CategoryNode } from "@shop/api/sdk"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react"

import {
    Badge,
    Button,
    FieldDescription,
    FieldTitle,
    Separator,
    Spinner,
    confirm,
    useAppForm,
} from "@shop/ui-web"

import { AttrPanel } from "./attr-panel"
import {
    categoryFormSchema,
    CATEGORY_ICON_MAX,
    CATEGORY_NAME_MAX,
    type CategoryFormValues,
} from "./category-form"
import { CATEGORY_STATUS_LABEL } from "./constants"
import {
    useCreateCategory,
    useReorderCategories,
    useSetCategoryStatus,
    useUpdateCategory,
} from "./queries"
import {
    appendSort,
    canNestUnder,
    isLeafCategory,
    moveWithinSiblings,
    orderUpdates,
    parentIdOf,
    CATEGORY_ROOT_ID,
    type CategoryIndex,
} from "./tree"

export interface CategoryDetailProps {
    node: CategoryNode
    index: CategoryIndex
    /** 选中新节点（新建子类目后把右栏切过去） */
    onSelect: (id: string | undefined) => void
    /** 展开某个节点（建完子类目要看得到刚建的那个） */
    onExpand: (id: string) => void
}

/**
 * 右栏：选中类目的详情与动作。
 *
 * 动作全在这里而不是树的行内按钮：树只负责「层级 + 选中」，行内塞一组图标按钮会让
 * 键盘导航与读屏名都变糊（每个按钮还得靠 subject 补名）。排序走同级上下移 + 树上的拖拽，
 * 两者最终都折成 `orderUpdates` 的同一份 sort 更新。
 */
export function CategoryDetail({ node, index, onSelect, onExpand }: CategoryDetailProps) {
    const reorder = useReorderCategories()
    const status = useSetCategoryStatus()
    const [creatingChild, setCreatingChild] = useState(false)

    const siblings = index.childIds[parentIdOf(index, node.id)] ?? []
    const position = siblings.indexOf(node.id)
    const canAddChild = canNestUnder(node.level) && node.status === "ENABLED"

    function move(delta: -1 | 1) {
        const next = moveWithinSiblings(siblings, position, delta)
        // 越界时 moveWithinSiblings 原样返回同一个引用，这里就不发一次没有变化的请求
        if (next === siblings) return
        reorder.mutate(orderUpdates(next, index.byId))
    }

    async function toggleStatus() {
        if (node.status === "ENABLED") {
            await confirm({
                title: `禁用「${node.name}」？`,
                description:
                    "禁用后该类目连同整支在买家侧不可见，可随时恢复；子树内仍有商品时后端会拒绝。",
                confirmText: "禁用",
                action: () => status.mutateAsync({ id: node.id, status: "DISABLED" }),
            })
            return
        }
        await status.mutateAsync({ id: node.id, status: "ENABLED" })
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="truncate text-base font-semibold">{node.name}</h2>
                        <Badge variant={node.status === "ENABLED" ? "success" : "outline"}>
                            {CATEGORY_STATUS_LABEL[node.status]}
                        </Badge>
                        <Badge variant="info">{node.level} 级类目</Badge>
                    </div>
                    <FieldDescription>
                        {canNestUnder(node.level)
                            ? "前两级只是分组，商品只能挂在三级类目上"
                            : "商品挂载点：属性模板在这里维护"}
                    </FieldDescription>
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => move(-1)}
                        disabled={position <= 0 || reorder.isPending}
                    >
                        <ArrowUpIcon />
                        <span className="sr-only">同级上移</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => move(1)}
                        disabled={
                            position < 0 || position >= siblings.length - 1 || reorder.isPending
                        }
                    >
                        <ArrowDownIcon />
                        <span className="sr-only">同级下移</span>
                    </Button>
                    <Button
                        variant={node.status === "ENABLED" ? "outline" : "secondary"}
                        size="sm"
                        onClick={() => void toggleStatus()}
                        disabled={status.isPending}
                    >
                        {node.status === "ENABLED" ? "禁用" : "启用"}
                    </Button>
                </div>
            </div>

            {/* key=id：换选中节点即重挂载，默认值按新节点重算——不用 effect 手动 reset */}
            <CategoryEditForm
                key={node.id}
                node={node}
            />

            <Separator />

            {canNestUnder(node.level) && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <FieldTitle>子类目</FieldTitle>
                        {!creatingChild && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCreatingChild(true)}
                                disabled={!canAddChild}
                                title={canAddChild ? undefined : "禁用中的类目不能再挂子类目"}
                            >
                                <PlusIcon data-slot="icon" />
                                新建子类目
                            </Button>
                        )}
                    </div>
                    {creatingChild && (
                        <CreateCategoryForm
                            parentId={node.id}
                            index={index}
                            onCreated={(id) => {
                                onExpand(node.id)
                                onSelect(id)
                                setCreatingChild(false)
                            }}
                            onCancel={() => setCreatingChild(false)}
                        />
                    )}
                </div>
            )}

            {isLeafCategory(node.level) && (
                <>
                    <Separator />
                    <AttrPanel categoryId={node.id} />
                </>
            )}
        </div>
    )
}

/** 改名与图标：名称是唯一的必填，提交前把两端空白剃掉（后端也 trim，两层同一口径） */
function CategoryEditForm({ node }: { node: CategoryNode }) {
    const update = useUpdateCategory()
    const form = useAppForm({
        defaultValues: {
            name: node.name,
            iconUrl: node.iconUrl ?? "",
        } satisfies CategoryFormValues,
        validators: { onSubmit: categoryFormSchema },
        onSubmit: async ({ value }) => {
            await update.mutateAsync({
                id: node.id,
                name: value.name.trim(),
                // 空串 = 清掉图标（queries 里把空串折成 undefined，后端落 null）
                iconUrl: value.iconUrl.trim(),
            })
        },
    })

    return (
        <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
            }}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <form.AppField name="name">
                    {(field) => (
                        <field.TextField
                            label="类目名称"
                            required
                            maxLength={CATEGORY_NAME_MAX}
                        />
                    )}
                </form.AppField>
                <form.AppField name="iconUrl">
                    {(field) => (
                        <field.TextField
                            label="图标 URL"
                            maxLength={CATEGORY_ICON_MAX}
                            placeholder="可选"
                        />
                    )}
                </form.AppField>
            </div>
            <div>
                <Button
                    type="submit"
                    size="sm"
                    disabled={update.isPending}
                >
                    {update.isPending && <Spinner />}
                    保存
                </Button>
            </div>
        </form>
    )
}

/** 新建类目：`parentId` 缺省即一级类目。sort 取同级末尾，与排序重算同一套步长 */
export function CreateCategoryForm({
    parentId,
    index,
    onCreated,
    onCancel,
}: {
    parentId?: string
    index: CategoryIndex
    onCreated: (id: string) => void
    onCancel: () => void
}) {
    const create = useCreateCategory()
    const form = useAppForm({
        defaultValues: { name: "", iconUrl: "" } satisfies CategoryFormValues,
        validators: { onSubmit: categoryFormSchema },
        onSubmit: async ({ value }) => {
            const created = await create.mutateAsync({
                parentId,
                name: value.name.trim(),
                iconUrl: value.iconUrl.trim(),
                sort: appendSort(index, parentId ?? CATEGORY_ROOT_ID),
            })
            onCreated(created.id)
        },
    })

    return (
        <form
            className="flex flex-col gap-3 rounded-lg border border-border p-3"
            onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
            }}
        >
            <form.AppField name="name">
                {(field) => (
                    <field.TextField
                        label="类目名称"
                        required
                        maxLength={CATEGORY_NAME_MAX}
                        placeholder={parentId ? "新子类目名称" : "新一级类目名称"}
                    />
                )}
            </form.AppField>
            <form.AppField name="iconUrl">
                {(field) => (
                    <field.TextField
                        label="图标 URL"
                        maxLength={CATEGORY_ICON_MAX}
                        placeholder="可选"
                    />
                )}
            </form.AppField>
            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={create.isPending}
                >
                    {create.isPending && <Spinner />}
                    创建
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                >
                    取消
                </Button>
            </div>
        </form>
    )
}
