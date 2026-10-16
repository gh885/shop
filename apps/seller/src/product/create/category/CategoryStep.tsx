import { Fragment, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ImageIcon, ListTree, Search } from "lucide-react"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Button,
    Input,
    Skeleton,
    Tabs,
    TabsList,
    TabsTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import {
    nodesOf,
    searchLeafPaths,
    selectAt,
    selectedLeafId,
    type LeafPath,
} from "#/product/category"
import { CategoryColumns } from "./CategoryColumns"
import { CategorySearchResults } from "./CategorySearchResults"
import { categoryTreeOptions, useLeafPaths } from "../../queries"

export function CategoryStep({
    mode,
    onModeChange,
    value,
    onConfirm,
}: {
    mode: "search" | "image"
    onModeChange: (mode: "search" | "image") => void
    value?: string
    onConfirm: (leafId: string) => void
}) {
    const t = useT("product")
    const { data: tree = [], isPending } = useQuery(categoryTreeOptions)
    const leafPaths = useLeafPaths()

    // undefined = 还没手动点过，跟随 URL 上的 value 回填
    const [picked, setPicked] = useState<string[] | undefined>()
    const selectedIds = picked ?? leafPaths.find((p) => p.id === value)?.ids ?? []

    const [draft, setDraft] = useState("")
    const [keyword, setKeyword] = useState("")

    const chain = nodesOf(tree, selectedIds)
    const leafId = selectedLeafId(tree, selectedIds)

    function pickPath(path: LeafPath) {
        setPicked(path.ids)
        setKeyword("")
        setDraft("")
    }

    return (
        <div className="space-y-4 pb-20">
            <div className="rounded-lg bg-background p-3 shadow-sm">
                <Tabs
                    value={mode}
                    onValueChange={(next) => {
                        if (next === "search" || next === "image") onModeChange(next)
                    }}
                    className="mb-3"
                >
                    <TabsList
                        variant="line"
                        className="h-10 w-full"
                    >
                        <TabsTrigger value="search">
                            <Search />
                            {t("product.category.tab.search")}
                        </TabsTrigger>
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <TabsTrigger
                                        value="image"
                                        disabled
                                    >
                                        <ImageIcon />
                                        {t("product.category.tab.image")}
                                    </TabsTrigger>
                                }
                            />
                            <TooltipContent>
                                {t("product.category.tab.imageComingSoon")}
                            </TooltipContent>
                        </Tooltip>
                    </TabsList>
                </Tabs>

                <form
                    className="mb-3 flex items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        setKeyword(draft.trim())
                    }}
                >
                    <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={t("product.category.search.placeholder")}
                        className="h-10 flex-1"
                    />
                    <Button
                        type="submit"
                        className="h-10"
                    >
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
                        <ListTree />
                        {t("product.category.search.selectCategory")}
                    </Button>
                </form>

                {isPending ? (
                    <Skeleton className="h-115 w-full rounded-lg" />
                ) : keyword ? (
                    <CategorySearchResults
                        keyword={keyword}
                        results={searchLeafPaths(leafPaths, keyword)}
                        selectedLeafId={leafId}
                        onPick={pickPath}
                    />
                ) : (
                    <CategoryColumns
                        tree={tree}
                        selectedIds={selectedIds}
                        onSelect={(column, id) => setPicked(selectAt(selectedIds, column, id))}
                    />
                )}
            </div>

            <ConfirmBar
                pathNames={chain.map((n) => n.name)}
                canNext={Boolean(leafId)}
                onNext={() => leafId && onConfirm(leafId)}
            />
        </div>
    )
}

function ConfirmBar({
    pathNames,
    canNext,
    onNext,
}: {
    pathNames: string[]
    canNext: boolean
    onNext: () => void
}) {
    const t = useT("product")
    return (
        <div className="fixed inset-x-0 bottom-0 z-sticky bg-background/90 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-narrow items-center gap-3 px-6">
                <span className="shrink-0 text-sm text-muted-foreground">
                    {t("product.category.confirm.label")}
                </span>
                {pathNames.length === 0 ? (
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {t("product.category.confirm.emptyHint")}
                    </span>
                ) : (
                    <Breadcrumb className="min-w-0 flex-1">
                        <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap">
                            {pathNames.map((name, i) => (
                                <Fragment key={name}>
                                    {i > 0 && <BreadcrumbSeparator />}
                                    <BreadcrumbItem>
                                        {i === pathNames.length - 1 ? (
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
                    onClick={onNext}
                    className="h-9"
                >
                    {t("product.category.confirm.next")}
                </Button>
            </div>
        </div>
    )
}
