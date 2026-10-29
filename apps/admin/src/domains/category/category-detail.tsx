import { useState } from "react"
import type { CategoryTreeNode } from "@shop/api/sdk"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react"

import { serverFieldErrors } from "@shop/app-kit/forms"
import {
    Badge,
    Button,
    FieldDescription,
    FieldTitle,
    Separator,
    Spinner,
    applyServerFieldErrors,
    confirm,
    useAppForm,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { InlineFormCard } from "#/shared/ui/inline-form-card"
import { AttrPanel } from "./attr-panel"
import { ConfigPanel } from "./config-panel"
import {
    categoryFormSchema,
    CATEGORY_CODE_MAX,
    CATEGORY_NAME_MAX,
    type CategoryFormValues,
} from "./category-form"
import { CATEGORY_STATUS_LABEL } from "./constants"
import {
    useCreateCategory,
    useRenameCategory,
    useReorderCategories,
    useSetCategoryStatus,
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
    node: CategoryTreeNode
    index: CategoryIndex
    onSelect: (id: string | undefined) => void
    onExpand: (id: string) => void
}

export function CategoryDetail({ node, index, onSelect, onExpand }: CategoryDetailProps) {
    const t = useT()
    const reorder = useReorderCategories()
    const status = useSetCategoryStatus()
    const [creatingChild, setCreatingChild] = useState(false)

    const id = node.id
    const level = node.level
    const siblings = index.childIds[parentIdOf(index, id)] ?? []
    const position = siblings.indexOf(id)
    const canAddChild = canNestUnder(level) && node.status === "ENABLED"

    function move(delta: -1 | 1) {
        const next = moveWithinSiblings(siblings, position, delta)
        // moveWithinSiblings 越界返回同一引用：相等即没动，不发一次没有变化的请求
        if (next === siblings) return
        reorder.mutate(orderUpdates(next, index.byId))
    }

    async function toggleStatus() {
        if (node.status === "ENABLED") {
            await confirm({
                title: t("category.confirm.disable.title", { name: node.name }),
                description: t("category.confirm.disable.description"),
                confirmText: t("category.action.disable"),
                action: () => status.mutateAsync({ categoryId: id, status: "DISABLED" }),
            })
            return
        }
        await status.mutateAsync({ categoryId: id, status: "ENABLED" })
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="truncate text-base font-semibold">{node.name}</h2>
                        <Badge variant={node.status === "ENABLED" ? "success" : "outline"}>
                            {t(
                                CATEGORY_STATUS_LABEL[
                                    node.status === "DISABLED" ? "DISABLED" : "ENABLED"
                                ],
                            )}
                        </Badge>
                        <Badge variant="info">{t("category.levelBadge", { level })}</Badge>
                    </div>
                    <FieldDescription>
                        {canNestUnder(level)
                            ? t("category.hint.groupOnly")
                            : t("category.hint.mountPoint")}
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
                        <span className="sr-only">{t("category.moveUp")}</span>
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
                        <span className="sr-only">{t("category.moveDown")}</span>
                    </Button>
                    <Button
                        variant={node.status === "ENABLED" ? "outline" : "secondary"}
                        size="sm"
                        onClick={() => void toggleStatus()}
                        disabled={status.isPending}
                    >
                        {node.status === "ENABLED"
                            ? t("category.action.disable")
                            : t("category.action.enable")}
                    </Button>
                </div>
            </div>

            {/* key=id：换选中节点即重挂载，默认值按新节点重算，不靠 effect reset */}
            <CategoryEditForm
                key={id}
                node={node}
            />

            <Separator />

            {canNestUnder(level) && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <FieldTitle>{t("category.children.title")}</FieldTitle>
                        {!creatingChild && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCreatingChild(true)}
                                disabled={!canAddChild}
                                title={
                                    canAddChild ? undefined : t("category.children.disabledHint")
                                }
                            >
                                <PlusIcon data-slot="icon" />
                                {t("category.children.add")}
                            </Button>
                        )}
                    </div>
                    {creatingChild && (
                        <CreateCategoryForm
                            parentId={id}
                            index={index}
                            onCreated={(createdId) => {
                                onExpand(id)
                                onSelect(createdId)
                                setCreatingChild(false)
                            }}
                            onCancel={() => setCreatingChild(false)}
                        />
                    )}
                </div>
            )}

            {isLeafCategory(level) && (
                <>
                    <Separator />
                    <AttrPanel categoryId={id} />
                    <Separator />
                    <ConfigPanel categoryId={id} />
                </>
            )}
        </div>
    )
}

function CategoryEditForm({ node }: { node: CategoryTreeNode }) {
    const t = useT()
    const update = useRenameCategory()
    const form = useAppForm({
        defaultValues: {
            code: node.code,
            name: node.name,
        } satisfies CategoryFormValues,
        validators: { onSubmit: categoryFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await update.mutateAsync({
                    categoryId: node.id,
                    name: value.name.trim(),
                })
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { name: "name" }))
                throw error
            }
        },
    })

    return (
        <InlineFormCard
            className="flex flex-col gap-3"
            form={form}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <form.AppField name="code">
                    {(field) => (
                        <field.TextField
                            label={t("category.form.code.label")}
                            required
                            disabled
                            maxLength={CATEGORY_CODE_MAX}
                        />
                    )}
                </form.AppField>
                <form.AppField name="name">
                    {(field) => (
                        <field.TextField
                            label={t("category.form.categoryName.label")}
                            required
                            maxLength={CATEGORY_NAME_MAX}
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
                    {t("category.form.submitSave")}
                </Button>
            </div>
        </InlineFormCard>
    )
}

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
    const t = useT()
    const create = useCreateCategory()
    const form = useAppForm({
        defaultValues: { code: "", name: "" } satisfies CategoryFormValues,
        validators: { onSubmit: categoryFormSchema },
        onSubmit: async ({ value }) => {
            try {
                const created = await create.mutateAsync({
                    parentId,
                    code: value.code.trim(),
                    name: value.name.trim(),
                    sort: appendSort(index, parentId ?? CATEGORY_ROOT_ID),
                })
                onCreated(created.categoryId)
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, { code: "code", name: "name" }),
                )
                throw error
            }
        },
    })

    return (
        <InlineFormCard
            className="flex flex-col gap-3 rounded-lg border border-border p-3"
            form={form}
        >
            <form.AppField name="name">
                {(field) => (
                    <field.TextField
                        label={t("category.form.categoryName.label")}
                        required
                        maxLength={CATEGORY_NAME_MAX}
                        placeholder={
                            parentId
                                ? t("category.form.categoryName.placeholderChild")
                                : t("category.form.categoryName.placeholderRoot")
                        }
                    />
                )}
            </form.AppField>
            <form.AppField name="code">
                {(field) => (
                    <field.TextField
                        label={t("category.form.code.label")}
                        required
                        maxLength={CATEGORY_CODE_MAX}
                        placeholder={t("category.form.code.placeholder")}
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
                    {t("category.form.submitCreate")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                >
                    {t("category.form.cancel")}
                </Button>
            </div>
        </InlineFormCard>
    )
}
