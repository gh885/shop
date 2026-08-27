import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Search } from "lucide-react"

import { Button, Logo } from "@shop/ui-web"

import { notify } from "#/shared/lib/toast"

/**
 * 购物车页顶栏：左品牌 logo + 「购物车」标题，右搜索组。
 * 搜索后端未建，先 toast 占位（与详情页顶栏一致）。
 */
export function CartHeader() {
    const [keyword, setKeyword] = useState("")

    const search = () => {
        if (!keyword.trim()) {
            notify.info("请输入搜索关键词")
            return
        }
        notify.info("搜索功能即将上线")
    }

    return (
        <header className="bg-background">
            <div className="mx-auto flex h-16 w-full max-w-(--container-page) items-center justify-between px-6">
                {/* 左：品牌 logo + 页面标题 */}
                <div className="flex items-center gap-3">
                    <Link
                        to="/"
                        className="shrink-0"
                        aria-label="有店首页"
                    >
                        <Logo size={36} />
                    </Link>
                    <h1 className="text-xl font-semibold text-foreground">购物车</h1>
                </div>

                {/* 右侧搜索组 */}
                <div className="flex h-9 w-[400px] items-center overflow-hidden rounded-lg border border-border bg-background">
                    <input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && search()}
                        placeholder="搜索"
                        aria-label="搜索商品"
                        className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <Button
                        onClick={search}
                        className="h-full rounded-none px-5"
                    >
                        <Search />
                        搜索
                    </Button>
                </div>
            </div>
        </header>
    )
}
