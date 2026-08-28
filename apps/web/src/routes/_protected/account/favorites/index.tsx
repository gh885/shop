import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@shop/ui-web"
import { HeartOff } from "lucide-react"

import {
    FavoriteCard,
    filterFavorites,
    Toolbar,
    useFavorites,
    useRemoveFavorites,
} from "#/favorite"

export const Route = createFileRoute("/_protected/account/favorites/")({
    component: FavoritesPage,
    head: () => ({
        meta: [{ title: "我的收藏 - 个人中心 - Shop" }],
    }),
})

function FavoritesPage() {
    // 页面局部 UI 状态（真实源在客户端）→ useState，不进 query
    const [keyword, setKeyword] = useState("")
    const [batchMode, setBatchMode] = useState(false)
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

    const { data: favorites = [] } = useFavorites()
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
        removeFavorites.mutate([...selected])
        setSelected(new Set())
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
        setBatchMode((prev) => {
            if (prev) setSelected(new Set())
            return !prev
        })
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
