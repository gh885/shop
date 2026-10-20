import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"

import { QueryBoundary } from "@shop/app-kit/data"
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

export function CategoryPage() {
    const t = useT()
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">{t("category.page.title")}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    {t("category.page.description")}
                </p>
            </div>
            <QueryBoundary fallback={t("common.loadFailed.categoryTree")}>
                <CategoryWorkspace />
            </QueryBoundary>
        </div>
    )
}

function CategoryWorkspace() {
    const t = useT()
    const { data, isPending } = useQuery(adminCategoryTreeOptions())
    const index = useMemo(() => indexCategoryTree(data ?? []), [data])

    const [selectedId, setSelectedId] = useState<string>()
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
                    <FieldTitle>{t("category.tree.title")}</FieldTitle>
                    {!creatingRoot && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCreatingRoot(true)}
                        >
                            <PlusIcon data-slot="icon" />
                            {t("category.addRoot")}
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
                            <EmptyTitle>{t("category.rootEmpty.title")}</EmptyTitle>
                            <EmptyDescription>
                                {t("category.rootEmpty.description")}
                            </EmptyDescription>
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
                            <EmptyTitle>{t("category.pickEmpty.title")}</EmptyTitle>
                            <EmptyDescription>
                                {t("category.pickEmpty.description")}
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
            </section>
        </div>
    )
}
