import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@shop/ui-web"
import { HeartOff } from "lucide-react"

import { FavoriteCard, FavoritesToolbar } from "#/features/favorites"
import { requireAuth } from "#/shared/api/auth"

export const Route = createFileRoute("/account/favorites/")({
    beforeLoad: () => requireAuth(),
    component: FavoritesPage,
    head: () => ({
        meta: [{ title: "我的收藏 - 个人中心 - Shop" }],
    }),
})

function FavoritesPage() {
    const [keyword, setKeyword] = useState("")
    const [batchMode, setBatchMode] = useState(false)
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

    const favorites: Parameters<typeof FavoriteCard>[0]["favorite"][] = MockFavorites

    // 关键词筛选（前端过滤；后端接入后改为查参）
    const filtered = favorites.filter((f) =>
        f.title.toLowerCase().includes(keyword.trim().toLowerCase()),
    )

    function toggleSelect(id: string) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // 退出批量模式时清空已选
    function toggleBatchMode() {
        setBatchMode((prev) => {
            if (prev) setSelected(new Set())
            return !prev
        })
    }

    return (
        <div className="space-y-5">
            <FavoritesToolbar
                total={filtered.length}
                keyword={keyword}
                onKeywordChange={setKeyword}
                batchMode={batchMode}
                onToggleBatchMode={toggleBatchMode}
                selectedCount={selected.size}
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
                            key={favorite.id}
                            favorite={favorite}
                            batchMode={batchMode}
                            selected={selected.has(favorite.id)}
                            onToggleSelect={toggleSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// TODO: 后端 /favorites 接口接入后替换为 useFavorites()；此处为临时占位数据
const MockFavorites: Parameters<typeof FavoriteCard>[0]["favorite"][] = [
    {
        id: "7b2e5d4a-1111-4c3b-9a01-000000000001",
        image: "",
        title: "毕业生（第十届茅盾文学奖得主，电视剧《人世间》原著作者梁晓声长篇力作）",
        collectCount: 1000,
        price: 3199,
    },
    {
        id: "7b2e5d4a-2222-4c3b-9a01-000000000002",
        image: "",
        title: "认知觉醒：开启自我改变的原动力（百万册纪念版）",
        collectCount: 35600,
        price: 4990,
    },
    {
        id: "7b2e5d4a-3333-4c3b-9a01-000000000003",
        image: "",
        title: "活着（余华代表作，2024精装典藏版）",
        collectCount: 980,
        price: 2800,
    },
    {
        id: "7b2e5d4a-4444-4c3b-9a01-000000000004",
        image: "",
        title: "三体（全三册，雨果奖获奖作品）",
        collectCount: 152000,
        price: 9300,
    },
    {
        id: "7b2e5d4a-4444-4c3b-9a01-000000000004",
        image: "",
        title: "三体（全三册，雨果奖获奖作品）",
        collectCount: 152000,
        price: 9300,
    },
]
