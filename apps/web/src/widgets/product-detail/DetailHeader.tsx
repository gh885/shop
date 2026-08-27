import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Search } from "lucide-react"

import { Button, Logo } from "@shop/ui-web"

import { notify } from "#/shared/lib/toast"

/**
 * 详情页顶栏（非吸顶，随页面滚走）：左品牌 logo，右搜索组（搜索 + 搜本店）。
 * 搜索/店内搜索后端未建，先 toast 占位。
 */
export function DetailHeader() {
    const [keyword, setKeyword] = useState("")

    const search = () => {
        if (!keyword.trim()) {
            notify.info("请输入搜索关键词")
            return
        }
        notify.info("搜索功能即将上线")
    }

    return (
        <header className="border-b border-border/60 bg-background">
            <div className="mx-auto flex h-16 w-full max-w-(--container-page) items-center justify-between px-6">
                {/* 品牌 logo：与首页同款 */}
                <Link
                    to="/"
                    className="shrink-0"
                    aria-label="有店首页"
                >
                    <Logo size={36} />
                </Link>

                {/* 右侧搜索组：输入框 + 搜索 + 搜本店 */}
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
                    <button
                        type="button"
                        onClick={() => notify.info("店内搜索即将上线")}
                        className="h-full shrink-0 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                        搜本店
                    </button>
                </div>
            </div>
        </header>
    )
}
