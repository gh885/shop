import { useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { Search } from "lucide-react"

import { Button, Logo } from "@shop/ui-web"

import { notify } from "#/shared/lib/toast"

/**
 * 通用页面顶栏（详情页 / 购物车页共用，非吸顶，随页面滚走）：左品牌 logo + 可选页面标题，右搜索组。
 * 搜索后端未建，先 toast 占位；extra 挂各页自己的附加按钮（如详情页「搜本店」）。
 */
export function SearchHeader({
    title,
    className,
    extra,
}: {
    title?: string
    className?: string
    extra?: ReactNode
}) {
    const [keyword, setKeyword] = useState("")

    const search = () => {
        if (!keyword.trim()) {
            notify.info("请输入搜索关键词")
            return
        }
        notify.info("搜索功能即将上线")
    }

    return (
        <header className={`bg-background ${className ?? ""}`}>
            <div className="mx-auto flex h-16 w-full max-w-(--container-page) items-center justify-between px-6">
                {/* 左：品牌 logo（与首页同款）+ 可选页面标题 */}
                <div className="flex items-center gap-3">
                    <Link
                        to="/"
                        className="shrink-0"
                        aria-label="有店首页"
                    >
                        <Logo size={36} />
                    </Link>
                    {title && <h1 className="text-xl font-semibold text-foreground">{title}</h1>}
                </div>

                {/* 右侧搜索组：2px 橙描边 + 实色橙按钮（与首页同款），各页附加按钮挂 extra */}
                <div className="flex h-9 w-[400px] items-center overflow-hidden rounded-md border-2 border-primary bg-background">
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
                    {extra}
                </div>
            </div>
        </header>
    )
}
