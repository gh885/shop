import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import {
    Button,
    confirm,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
} from "@shop/ui-web"
import { HeartOff } from "lucide-react"

import {
    dropSelection,
    EMPTY_SELECTION,
    FavoriteCard,
    favoriteItemsOptions,
    filterFavorites,
    pickAllSelection,
    toggleSelection,
    Toolbar,
    useRemoveFavorites,
} from "#/favorite"
import { useSuspenseQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/account/favorites/")({
    /**
     * 数据在 loader 里读完再渲染（官方 loader-as-data-source）：
     * 挂起 → `pendingComponent`，失败 → 路由错误页 + 官方重置重试；SSR 阶段直接跳过。
     */
    loader: async ({ context }) => {
        if (import.meta.env.SSR) return
        await context.queryClient.query({ ...favoriteItemsOptions, staleTime: "static" })
    },
    pendingComponent: FavoritesSkeleton,
    component: FavoritesPage,
    head: () => ({
        meta: [{ title: "我的收藏 - 个人中心 - Shop" }],
    }),
})

/** 挂起占位：按卡片网格形状占位，避免闪现误导性空态 */
function FavoritesSkeleton() {
    return (
        <div className="space-y-5">
            <h2 className="text-xl font-bold">我的收藏</h2>
            <Skeleton className="h-10 w-full" />
            <div className="flex flex-wrap gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton
                        key={i}
                        className="h-72 w-60 rounded-xl"
                    />
                ))}
            </div>
        </div>
    )
}

// oxlint-disable-next-line react-doctor/no-high-complexity-react-function -- 页面四态渲染 + 批量操作状态（选择/模式）集中在页面是刻意结构，派生（filtered）与 handlers 已扁平；拆分需传 7+ props 的宽接口
function FavoritesPage() {
    const navigate = useNavigate()
    // 页面局部 UI 状态（真实源在客户端）→ useState，不进 query
    const [keyword, setKeyword] = useState("")
    const [batchMode, setBatchMode] = useState(false)
    const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY_SELECTION)

    // 主体数据由 loader 读完（失败已由路由错误页接管）
    const favorites = useSuspenseQuery(favoriteItemsOptions).data
    const removeFavorites = useRemoveFavorites()

    const filtered = filterFavorites(favorites, keyword)

    // 勾选集合的转移规则（谁变、什么不变、什么时候换引用）在 favorite.ts
    function handleRemove(productId: string) {
        removeFavorites.mutate([productId])
        setSelected((prev) => dropSelection(prev, productId))
    }

    function handleBatchDelete() {
        if (selected.size === 0) return
        void confirm({
            title: "取消收藏",
            description: `确定移除选中的 ${selected.size} 件商品收藏吗？`,
            confirmText: "移除",
            action: async () => {
                await removeFavorites.mutateAsync([...selected])
                setSelected(EMPTY_SELECTION)
            },
        })
    }

    function handleToggleSelectAll(checked: boolean) {
        setSelected(pickAllSelection(filtered, checked))
    }

    function toggleSelect(productId: string) {
        setSelected((prev) => toggleSelection(prev, productId))
    }

    function toggleBatchMode() {
        // 退出批量模式时清空选择；updater 内不副作用（不纯），按当前值直接更新
        if (batchMode) setSelected(EMPTY_SELECTION)
        setBatchMode(!batchMode)
    }

    return (
        <div className="space-y-5">
            <h2 className="text-xl font-bold">我的收藏</h2>
            <Toolbar
                total={filtered.length}
                keyword={keyword}
                onKeywordChange={setKeyword}
                batchMode={batchMode}
                onToggleBatchMode={toggleBatchMode}
                selectedCount={selected.size}
                allSelected={filtered.length > 0 && selected.size >= filtered.length}
                onToggleSelectAll={handleToggleSelectAll}
                onBatchDelete={handleBatchDelete}
            />

            {filtered.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <HeartOff />
                        </EmptyMedia>
                        <EmptyTitle>
                            {favorites.length === 0 ? "暂无收藏" : "没有匹配的收藏"}
                        </EmptyTitle>
                        <EmptyDescription>
                            {favorites.length === 0
                                ? "浏览商品时点击收藏，心仪好物都会汇集在这里。"
                                : "换个关键词试试。"}
                        </EmptyDescription>
                        {favorites.length === 0 ? (
                            <Button
                                className="mt-2"
                                onClick={() => void navigate({ to: "/" })}
                            >
                                去逛逛
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                className="mt-2"
                                onClick={() => setKeyword("")}
                            >
                                清除搜索
                            </Button>
                        )}
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {filtered.map((favorite) => (
                        <FavoriteCard
                            key={favorite.productId}
                            favorite={favorite}
                            batchMode={batchMode}
                            selected={selected.has(favorite.productId)}
                            onToggleSelect={toggleSelect}
                            onRemove={handleRemove}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
