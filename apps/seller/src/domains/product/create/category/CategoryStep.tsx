import { Fragment, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Button,
    Input,
    Skeleton,
} from "@shop/ui-web"
import { ListTree, Search } from "lucide-react"

import { useT } from "#/locales/use-t"
import { categoryTreeOptions } from "../queries"
import { CategoryColumns } from "./CategoryColumns"
import { CategorySearchResults } from "./CategorySearchResults"
import { findCategoryPath, mountableLeaves, selectAt, type CategoryPath } from "./tree"

export function CategoryStep({
    value,
    onConfirm,
}: {
    value?: string
    onConfirm: (leafId: string) => void
}) {
    const t = useT("product")
    const { data: tree = [], isPending } = useQuery(categoryTreeOptions)
    const [picked, setPicked] = useState<string[] | undefined>()
    const selectedIds =
        picked ?? (value === undefined ? [] : (findCategoryPath(tree, value)?.ids ?? []))

    const [draft, setDraft] = useState("")
    const [keyword, setKeyword] = useState("")

    const selectedId = selectedIds.at(-1)
    const path = selectedId === undefined ? undefined : findCategoryPath(tree, selectedId)
    const canNext = path?.mountable === true

    function pickPath(next: CategoryPath) {
        setPicked(next.ids)
        setKeyword("")
        setDraft("")
    }

    return (
        <div className="space-y-4 pb-20">
            <div className="rounded-lg bg-background p-3 shadow-sm">
                <form
                    className="mb-3 flex items-center gap-2"
                    onSubmit={(event) => {
                        event.preventDefault()
                        setKeyword(draft.trim())
                    }}
                >
                    <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={t("product.category.search.placeholder")}
                        className="h-10 flex-1"
                    />
                    <Button
                        type="submit"
                        className="h-10"
                    >
                        <Search className="size-4" />
                        {t("product.category.search.submit")}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-10"
                        onClick={() => {
                            setKeyword("")
                            setDraft("")
                        }}
                    >
                        <ListTree className="size-4" />
                        {t("product.category.search.selectCategory")}
                    </Button>
                </form>

                {isPending ? (
                    <Skeleton className="h-115 w-full rounded-lg" />
                ) : keyword === "" ? (
                    <CategoryColumns
                        tree={tree}
                        selectedIds={selectedIds}
                        onSelect={(column, id) => setPicked(selectAt(selectedIds, column, id))}
                    />
                ) : (
                    <CategorySearchResults
                        keyword={keyword}
                        results={mountableLeaves(tree).filter((item) =>
                            item.names.at(-1)!.toLowerCase().includes(keyword.toLowerCase()),
                        )}
                        selectedLeafId={path?.id}
                        onPick={pickPath}
                    />
                )}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-sticky bg-background/90 py-3 backdrop-blur">
                <div className="mx-auto flex w-full max-w-narrow items-center gap-3 px-6">
                    <span className="shrink-0 text-sm text-muted-foreground">
                        {t("product.category.confirm.label")}
                    </span>
                    {path === undefined ? (
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                            {t("product.category.confirm.emptyHint")}
                        </span>
                    ) : (
                        <Breadcrumb className="min-w-0 flex-1">
                            <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap">
                                {path.names.map((name, index) => (
                                    <Fragment key={name}>
                                        {index > 0 && <BreadcrumbSeparator />}
                                        <BreadcrumbItem>
                                            {index === path.names.length - 1 ? (
                                                <BreadcrumbPage>{name}</BreadcrumbPage>
                                            ) : (
                                                name
                                            )}
                                        </BreadcrumbItem>
                                    </Fragment>
                                ))}
                            </BreadcrumbList>
                        </Breadcrumb>
                    )}
                    <Button
                        disabled={!canNext}
                        onClick={() => path?.mountable === true && onConfirm(path.id)}
                        className="h-9"
                    >
                        {t("product.category.confirm.next")}
                    </Button>
                </div>
            </div>
        </div>
    )
}
