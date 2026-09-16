import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import {
    Button,
    ConfirmDialog,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
} from "@shop/ui-web"
import { HeartOff } from "lucide-react"

import {
    FavoriteCard,
    favoriteItemsOptions,
    filterFavorites,
    Toolbar,
    useFavorites,
    useRemoveFavorites,
} from "#/favorite"
import { noop } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/account/favorites/")({
    // 客户端预热（受保护页 SSR 服务端拿不到 token，loader 在服务端直接跳过，见 _protected/route.tsx）：
    // hover/导航先拉好收藏列表缓存，组件挂载即命中。query() 失败会 reject —— 预热而已，吞掉；
    // 错误仍由组件侧的就地错误态处理。
    loader: ({ context }) => {
        if (import.meta.env.SSR) return
        void context.queryClient.query(favoriteItemsOptions).catch(noop)
    },
    component: FavoritesPage,
    head: () => ({
        meta: [{ title: "我的收藏 - 个人中心 - Shop" }],
    }),
})

function FavoritesPage() {
    const navigate = useNavigate()
    // 页面局部 UI 状态（真实源在客户端）→ useState，不进 query
    const [keyword, setKeyword] = useState("")
    const [batchMode, setBatchMode] = useState(false)
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)

    const { data: favorites = [], isPending, isError, refetch } = useFavorites()
    const removeFavorites = useRemoveFavorites()

    const filtered = filterFavorites(favorites, keyword)

    function handleRemove(productId: string) {
        removeFavorites.mutate([productId])
        setSelected((prev) => {
            if (!prev.has(productId)) return prev
            const next = new Set(prev)
            next.delete(productId)
            return next
        })
    }

    function handleBatchDelete() {
        if (selected.size === 0) return
        removeFavorites.mutate([...selected], {
            onSuccess: () => {
                setBatchConfirmOpen(false)
                setSelected(new Set())
            },
        })
    }

    function handleToggleSelectAll(checked: boolean) {
        setSelected(checked ? new Set(filtered.map((f) => f.productId)) : new Set())
    }

    function toggleSelect(productId: string) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(productId)) next.delete(productId)
            else next.add(productId)
            return next
        })
    }

    function toggleBatchMode() {
        // 退出批量模式时清空选择；updater 内不副作用（不纯），按当前值直接更新
        if (batchMode) setSelected(new Set())
        setBatchMode(!batchMode)
    }

    return (
        <div className="space-y-5">
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

            {isPending ? (
                /* 首次加载：按卡片网格形状占位，避免闪现误导性空态 */
                <div className="flex flex-wrap gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton
                            /* eslint-disable-next-line react/no-array-index-key */
                            key={i}
                            className="h-72 w-60 rounded-xl"
                        />
                    ))}
                </div>
            ) : isError ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <HeartOff />
                        </EmptyMedia>
                        <EmptyTitle>加载失败</EmptyTitle>
                        <EmptyDescription>收藏列表加载失败，请重试。</EmptyDescription>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void refetch()}
                        >
                            重新加载
                        </Button>
                    </EmptyHeader>
                </Empty>
            ) : filtered.length === 0 ? (
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

            {/* 批量删除二次确认 */}
            <ConfirmDialog
                open={batchConfirmOpen}
                onOpenChange={setBatchConfirmOpen}
                title="取消收藏"
                description={<>确定移除选中的 {selected.size} 件商品收藏吗？</>}
                confirmText="移除"
                pending={removeFavorites.isPending}
                onConfirm={handleBatchDelete}
            />
        </div>
    )
}
