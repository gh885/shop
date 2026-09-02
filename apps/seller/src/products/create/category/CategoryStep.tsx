import { useState } from "react"
import { ImageIcon, ListTree, Search } from "lucide-react"
import { Button, Input, Skeleton, Tabs, TabsList, TabsTrigger } from "@shop/ui-web"

import { nodesOf, searchLeafPaths, selectAt, selectedLeafId, type LeafPath } from "../../category"
import { CategoryColumns } from "./CategoryColumns"
import { CategorySearchResults } from "./CategorySearchResults"
import { useCategoryTree, useLeafPaths } from "../../use-category"

/**
 * 发布第一步：选类目（千牛「搜索发品 / 以图发品」那一屏）。
 * 上→下＝发品方式页签、搜索栏、结果或级联三列，页面最底部通栏固定「已选类目 + 下一步」。
 * 「以图发品」需要图像识别服务，本期不做，页签置灰占位。
 * 类目一旦发布不可改，所以这步单独成屏，选中路径始终可见。
 * 样式走底色分层（浅灰工作区 + 白色列面），不描边框。
 */
export function CategoryStep({
    mode,
    onModeChange,
    value,
    onConfirm,
}: {
    /** 发品方式（来自 URL）：search（搜索发品）/ image（以图发品，本期置灰） */
    mode: "search" | "image"
    /** 切换发品方式：由父级写回 URL（刷新可恢复） */
    onModeChange: (mode: "search" | "image") => void
    /** 已选末级类目 id（来自 URL），用于返回本步时回填 */
    value: string | undefined
    onConfirm: (leafId: string) => void
}) {
    const { data: tree = [], isPending } = useCategoryTree()
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
            <div className="rounded-2xl bg-background p-3 shadow-sm">
                <Tabs
                    value={mode}
                    onValueChange={(next) => {
                        if (next === "search" || next === "image") onModeChange(next)
                    }}
                    className="mb-3"
                >
                    <TabsList className="h-10 w-full bg-transparent p-0">
                        <TabsTrigger
                            value="search"
                            className="text-base"
                        >
                            <Search />
                            搜索发品
                        </TabsTrigger>
                        <TabsTrigger
                            value="image"
                            disabled
                            title="以图发品即将上线"
                            className="text-base"
                        >
                            <ImageIcon />
                            以图发品
                        </TabsTrigger>
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
                        placeholder="输入商品名找类目，如「宠物喂食器」"
                        className="h-10 flex-1 border-transparent bg-muted/60 shadow-none focus-visible:border-transparent"
                    />
                    <Button
                        type="submit"
                        className="h-10 px-6"
                    >
                        搜索
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-10 bg-background hover:bg-background/70"
                        onClick={() => {
                            setKeyword("")
                            setDraft("")
                        }}
                    >
                        <ListTree />
                        选择类目
                    </Button>
                </form>

                {isPending ? (
                    <Skeleton className="h-115 w-full rounded-xl" />
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

/** 底部操作条：固定在窗口最底部、通栏，已选类目路径常驻 + 「确认，下一步」（未选到末级不可点） */
function ConfirmBar({
    pathNames,
    canNext,
    onNext,
}: {
    pathNames: string[]
    canNext: boolean
    onNext: () => void
}) {
    return (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-background/90 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-narrow items-center gap-3 px-6">
                <span className="shrink-0 text-sm text-muted-foreground">类目</span>
                {pathNames.length === 0 ? (
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        搜索或逐级选择，选到末级类目才能继续
                    </span>
                ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {pathNames.map((name, i) => (
                            <span key={name}>
                                {i > 0 && (
                                    <span className="mx-1.5 text-muted-foreground">&gt;</span>
                                )}
                                {name}
                            </span>
                        ))}
                    </span>
                )}
                <Button
                    disabled={!canNext}
                    onClick={onNext}
                    className="h-9 px-6"
                >
                    确认，下一步
                </Button>
            </div>
        </div>
    )
}
